import React from 'react';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { AccountInterface, InstitutionInterface } from '../State/State';
import { getSubTypeName, getTypeName } from '../State/AccountTypes';
import Amount from '../Amount';
import styles from './Account.module.css';
import { useDeleteConfirmation } from '../DeleteConfirmation';

type PropsType = {
  selected: boolean,
  institution: InstitutionInterface,
  account: AccountInterface,
  onAccountSelected: (account: AccountInterface) => void,
  onAccountStateChange: (account: AccountInterface) => void,
  showAccountDialog: (account: AccountInterface) => void,
}

const Account: React.FC<PropsType> = observer(({
  selected,
  institution,
  account,
  onAccountSelected,
  onAccountStateChange,
  showAccountDialog,
}) => {
  const [CloseConfirmation, handleCloseClick] = useDeleteConfirmation(
    account.closed ? 'Open Confirmation' : 'Close Confirmation',
    account.closed ? 'Open' : 'Close',
    (
      <>
        <div>
          {
            `Are you sure you want to ${account.closed ? 'open' : 'close'} this account?`
          }
        </div>
        <div style={{ marginTop: '1rem' }}>
          {
            `Accounts can be ${account.closed ? 'reclosed' : 'reopened'} from the ${account.closed ? 'Opened' : 'Closed'} tab.`
          }
        </div>
      </>
    ),
    () => {
      account.setClosed(!account.closed);
      onAccountStateChange(account);
    },
  );

  const accountSelected = () => {
    onAccountSelected(account);
  };

  let acctClassName = styles.account;
  if (account.type === 'other') {
    acctClassName += ` ${styles.otherAccount}`
  }
  else if (['loan', 'credit'].includes(account.type)) {
    acctClassName += ` ${styles.creditAccount}`
  }

  if (selected) {
    acctClassName += ` ${styles.selected}`;
  }

  return (
    <div className={acctClassName} onClick={accountSelected}>
      <div className={styles.buttons}>
        {
          !institution.offline
            ? null
            : <IconButton icon="edit" onClick={() => showAccountDialog(account)} />
        }
        <IconButton icon={account.closed ? 'circle' : 'times-circle'} solid={false} onClick={handleCloseClick} />
      </div>
      <div className={styles.accountInfo}>
        <div className={styles.accountName}>{account.name}</div>
        <div style={{ display: 'flex' }}>
          <Amount style={{ textAlign: 'left' }} amount={account.balance} />
          {
            account.plaidBalance !== null && account.balance !== account.plaidBalance
              ? (
                <>
                  <div>/</div>
                  <Amount style={{ textAlign: 'left' }} amount={account.plaidBalance} />
                </>
              )
              : null
          }
        </div>
        <div>{getTypeName(account.type)}</div>
        <div>{getSubTypeName(account.type, account.subtype)}</div>
        {
          account.type === 'loan'
            ? (
              <div>
                {
                  account.rate === null
                    ? 'APR: unknown'
                    : `APR: ${account.rate}%`
                }
              </div>
            )
            : null
        }
      </div>
      <CloseConfirmation />
    </div>
  );
});

export default Account;
