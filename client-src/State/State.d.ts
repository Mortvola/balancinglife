import { DateTime } from 'luxon';
import Reports from './Reports';
import {
  CategoryType, Error, TrackingType, AccountType, Location, AccountTrackingProps,
} from '../../common/ResponseTypes'
import LoanTransaction from './LoanTransaction';

export interface UserInterface {
  username: string | null;

  email: string | null;
}

export type TreeNodeInterface = (CategoryInterface | GroupInterface);

export interface GroupInterface {
  id: number;

  name: string;

  type: string;

  categories: CategoryInterface[];

  insertCategory(category: CategoryInterface): void;

  removeCategory(category: CategoryInterface): void;

  delete (): Promise<null | Error[]>;

  update(name: string): Promise<null | Error[]>;
}

export interface TransactionInterface {
  id: number | null;

  amount: number;

  principle: number | null,

  date: DateTime;

  type: TransactionType;

  name: string;

  categories: TransactionCategoryInterface[];

  instituteName: string;

  accountName: string;

  reconciled: boolean;

  accountOwner: string | null;

  transaction?: {
    date: string;

    id: number;

    sortOrder: number;

    type: number;
  }

  paymentChannel: string | null;

  location: Location | null;

  comment: string;

  duplicateOfTransactionId: number | null;

  getAmountForCategory(categoryId: number): number;

  async updateTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<null>;

  async delete(): Promise<null | Error[]>;

  toggleReconciled(): void;
}

export interface PendingTransactionInterface {
  id: number | null;

  amount: number;

  date: DateTime;

  name: string;

  instituteName: string;

  accountName: string;

  accountOwner: string | null;
}

export interface AccountsInterface {
  initialized: boolean;

  institutions: InstitutionInterface[];

  store: StoreInterface;

  async load(): Promise<void>;

  findAccount(id: number): AccountInterface | null;

  async linkInstitution(): Promise<void>;

  updateBalances(balances: AccountBalanceProps[]): void;

  async addOfflineAccount(
    institiute: string,
    account: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  async addInstitution(
    publicToken: string,
    plaidInstitutionId: string,
    startDate: string,
    accounts: AccountTrackingProps[],
  ): Promise<Institution | null>;

  deleteInstitution(instiution: InstitutionInterface): void;

  closeAccount();
}

export interface CategoryInterface extends TransactionContainerInterface {
  id: number;

  name: string;

  type: CategoryType;

  groupId: number;

  monthlyExpenses: boolean;

  loan: {
    balance: number;
    transactions: LoanTransaction[];
  };

  store: StoreInterface;

  getPendingTransactions(index = 0): Promise<void>;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;

  update(name: string, group: GroupInterface, monthlyExpenses: boolean): Promise<null | Error[]>;

  delete (): Promise<null | Error[]>;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getGroup(): GroupInterface;
}

export type RebalancesInterface = TransactionContainerInterface;

export interface FundingPlanInterface {
  id: number;

  name: string;

  async update(name: string): Promise<void>;
}

export type Views = 'HOME' | 'PLANS' | 'ACCOUNTS' | 'REPORTS' | 'USER_ACCOUNT' | 'LOGOUT';

export interface UIStateInterface {
  selectCategory(category: CategoryInterface | null): void;
  selectAccount(account: AccountInterface | null): void;
  selectPlan(plan: FundingPlanInterface | null): void;
  selectTransaction(transaction: TransactionInterface | null): void;

  selectedCategory: CategoryInterface | null;
  selectedPlan: FundingPlanInterface | null;
  selectedAccount: AccountInterface | null;
  selectedTransaction: TransactionInterface | null;
  plaid: Plaid | null;
}

export interface CategoryTreeInterface {
  systemIds: SystemIds;

  noGroupGroup: GroupInterface | null;

  unassignedCat: CategoryInterface | null;

  fundingPoolCat: CategoryInterface | null;

  accountTransferCat: CategoryInterface | null;

  rebalances: RebalancesInterface | null;

  nodes: (CategoryInterface | GroupInterface)[] = [];

  insertNode(node: TreeNodeInterface): void;

  updateBalances(balances: CategoryBalanceProps[]): void;

  getCategory(categoryId: number): CategoryInterface | null;

  getCategoryGroup(categoryId: number): GroupInterface;

  removeNode(node: GroupInterface | CategoryInterface): void;
}

export interface CategoryBalanceInterface {
  id: number,
  balance:number,
}

export interface TransactionCategoryInterface {
  id?: number;
  categoryId: number;
  amount: number;
  comment?: string;
}

export interface NewTransactionCategoryInterface {
  type: CategoryType;
  categoryId: number;
  amount: number;
}

export interface RegisterInterface {
  removeTransaction(transactionId: number): void;
}

export interface InstitutionInterface {
  id: number;

  name: string;

  offline: boolean;

  accounts: AccountInterface[];

  unlinkedAccounts: UnlinkedAccountProps[] | null;

  refreshing: boolean;

  syncDate: DateTime | null;

  relink(): Promise<void>;

  refresh(institutionId: number): Promise<boolean>;

  async update(
    startDate: string,
    accounts: AccountTrackingProps[],
  ): Promise<InstitutionInterface | null>;

  addOnlineAccounts(
    accounts: UnlinkedAccountProps[],
    startDate: string,
  ): Promise<null>;

  addOfflineAccount(
    accountName: string,
    balance: number,
    startDate: string,
    type: string,
    subtype: string,
    tracking: TrackingType,
    rate: number,
  ): Promise<Error[] | null>;

  // getUnlinkedAccounts(): Promise<void>;

  deleteAccount(account: AccountInterface): void;

  closeAccount(account: AccountInterface): void;

  delete(): void;

  hasOpenAccounts(): boolean;

  hasClosedAccounts(): boolean;
}

export interface QueryManagerInterface {
  fetching: boolean;
}

export interface TransactionContainerInterface {
  balance: number;

  transactions: TransactionInterface[];

  pending: PendingTransactionInterface[];

  transactionsQuery: QueryManagerInterface;

  getTransactions(index?: number): Promise<void>;

  getMoreTransactions(): Promise<void>;
}

export interface AccountInterface extends TransactionContainerInterface {
  id: number;

  name: string;

  officialName: string | null = null;

  closed: boolean;

  type: AccountType;

  subtype: string;

  tracking: TrackingType;

  plaidBalance: number | null;

  rate: number | null;

  institution: InstitutionInterface;

  store: StoreInterface;

  getPendingTransactions(): Promise<void>;

  addTransaction(
    values: {
      date?: string,
      name?: string,
      amount?: number,
      principle?: number,
      comment?: string,
      splits: (TransactionCategoryInterface | NewTransactionCategoryInterface)[],
    },
  ): Promise<Error[] | null>;

  insertTransaction(transaction: Transaction): void;

  removeTransaction(transactionId: number): void;

  delete(): void;

  updateOfflineAccount(name: string): void;

  setClosed(closed: boolean): void;
}

export interface BalanceInterface {
  id: number;

  date: DateTime;

  balance: number;

  update(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<Error[] | null>;

  delete(): Promise<null | Error[]>;
}

export interface BalancesInterface {
  account: AccountInterface | null;

  balances: Balance[];

  store: StoreInterface;

  addBalance(
    values: {
      date: string,
      amount: number,
    },
  ): Promise<Error[] | null>;

  insertBalance(balance: Balance): void;

  removeBalance(balance: BalanceInterface);
}

export interface PlansInterface {
  list: FundingPlan[];

  details: FundingPlanDetails | null = null;
}

export interface StoreInterface {
  user: UserInterface;

  categoryTree: CategoryTreeInterface;

  register: RegisterInterface;

  accounts: AccountsInterface;

  balances: BalancesInterface;

  uiState: UIStateInterface;

  reports: Reports;

  plans: PlansInterface;
}

export type AddTransactionRequest = {
  date?: string,
  name?: string,
  amount?: number,
  splits:(TransactionCategoryInterface | NewTransactionCategoryInterface)[],
};
