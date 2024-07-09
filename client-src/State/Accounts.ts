import { makeAutoObservable, runInAction } from 'mobx';
import Http from '@mortvola/http';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { DateTime } from 'luxon';
import Institution from './Institution';
import Plaid from './Plaid';
import {
  AccountBalanceProps, AccountType, AddInstitutionProps, AddInstitutionResponse,
  Error, isAddInstitutionResponse, isDeleteInstitutionResponse,
  isInstitutionsResponse, isLinkTokenResponse, TrackingType,
} from '../../common/ResponseTypes';
import {
  AccountInterface, AccountsInterface, InstitutionInterface, StoreInterface,
} from './Types';

class Accounts implements AccountsInterface {
  initialized = false;

  institutions: Institution[] = [];

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  findAccount(id: number): AccountInterface | null {
    let foundAccount: AccountInterface | null = null;
    this.institutions.some((i) => {
      const account = i.accounts.find((a) => a.id === id);

      if (account) {
        foundAccount = account;
        return true;
      }

      return false;
    });

    return foundAccount;
  }

  async load(): Promise<void> {
    const response = await Http.get('/api/v1/connected-accounts');

    if (!response.ok) {
      throw new Error('invalid response');
    }

    const body = await response.body();

    if (body) {
      if (isInstitutionsResponse(body)) {
        runInAction(() => {
          this.institutions = [];

          body.forEach((i) => {
            const institution = new Institution(this.store, i);
            this.insertInstitution(institution);
          });

          this.initialized = true;
        });
      }
    }
  }

  insertInstitution(institution: Institution): void {
    const index = this.institutions.findIndex(
      (inst) => institution.name.localeCompare(inst.name) < 0,
    );

    if (index === -1) {
      this.institutions = [
        ...this.institutions.slice(),
        institution,
      ];
    }
    else {
      this.institutions = [
        ...this.institutions.slice(0, index),
        institution,
        ...this.institutions.slice(index),
      ]
    }

    // Make sure the accounts are sorted by name.
    institution.accounts.sort((a, b) => {
      const c = a.name.localeCompare(b.name);

      // If the names are the same then sort by id
      if (c === 0) {
        return a.id - b.id;
      }

      return c;
    });
  }

  async linkInstitution(): Promise<void> {
    const response = await Http.get('/api/v1/user/link-token');

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        if (isLinkTokenResponse(body)) {
          this.store.uiState.plaid = new Plaid(body.linkToken);
        }
      });
    }
  }

  async addInstitution(
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  ): Promise<Institution | null> {
    if (!metadata.institution) {
      throw new Error('metadata institution is null')
    }

    runInAction(() => {
      if (!metadata.institution) {
        throw new Error('metadata institution is null')
      }

      const institution = new Institution(
        this.store,
        {
          id: -1,
          plaidInstitutionId: metadata.institution.institution_id,
          name: metadata.institution.name,
          offline: false,
          syncDate: null,
          accounts: metadata.accounts.map((a, index) => ({
            id: -(index + 1),
            plaidId: a.id,
            name: a.name,
            closed: false,
            type: a.type as AccountType,
            subtype: a.subtype,
            tracking: 'Transactions',
            balance: 0,
            plaidBalance: 0,
            startDate: DateTime.now().startOf('month').toISODate(),
            rate: null,
          })),
        },
      )
      this.insertInstitution(institution);
    });

    const response = await Http.post<AddInstitutionProps, AddInstitutionResponse>('/api/v1/institution', {
      publicToken,
      institutionId: metadata.institution.institution_id,
    });

    if (response.ok) {
      const body = await response.body();

      runInAction(() => {
        // Make sure we don't already have the institution in the list.
        let institution = this.institutions.find(
          (inst) => inst.plaidInstitutionId === body.plaidInstitutionId,
        );

        if (!institution) {
          institution = new Institution(this.store, body);
          this.insertInstitution(institution);
        }
        else {
          institution.update2(body);
        }

        this.store.categoryTree.updateBalances(body.categories);
      });
    }

    return null;
  }

  async addOfflineAccount(
    instituteName: string,
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null> {
    const response = await Http.post('/api/v1/institution', {
      institution: {
        name: instituteName,
      },
      accounts: [{
        name: accountName,
        balance,
        type,
        subtype,
        tracking,
        rate,
      }],
      startDate,
    });

    if (response.ok) {
      const body = await response.body();

      if (isAddInstitutionResponse(body)) {
        runInAction(() => {
          const institution = new Institution(this.store, {
            id: body.id,
            plaidInstitutionId: body.plaidInstitutionId,
            name: body.name,
            offline: true, // body.offline,
            syncDate: body.syncDate,
            accounts: body.accounts,
          });

          // Make sure we don't already have the institution in the list.
          const existingIndex = this.institutions.findIndex(
            (inst) => inst.id === institution.id,
          );

          if (existingIndex === -1) {
            this.insertInstitution(institution);
          }

          this.store.categoryTree.updateBalances(body.categories);
        });
      }
    }

    return null;
  }

  updateBalances(balances: AccountBalanceProps[]): void {
    runInAction(() => {
      this.institutions.forEach((i) => {
        i.updateBalances(balances);
      });
    });
  }

  async deleteInstitution(institution: InstitutionInterface): Promise<void> {
    const response = await Http.delete(`/api/v1/institution/${institution.id}`);

    if (response.ok) {
      const body = await response.body();

      if (isDeleteInstitutionResponse(body)) {
        runInAction(() => {
          const index = this.institutions.findIndex((i) => i.id === institution.id);

          if (index !== -1) {
            this.institutions = [
              ...this.institutions.slice(0, index),
              ...this.institutions.slice(index + 1),
            ];
          }

          this.store.categoryTree.updateBalances(body);
        });
      }
    }
  }

  closeAccount(): void {
    runInAction(() => {
      this.institutions = this.institutions.slice();
    });
  }
}

export default Accounts;
