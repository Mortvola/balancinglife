import React from 'react';
import { observer } from 'mobx-react-lite';
import Amount from '../../Amount';
import { CategoryInterface, TransactionInterface } from '../../State/State';
import useMediaQuery from '../../MediaQuery';
import { TransactionType } from '../../../common/ResponseTypes';
import styles from '../Transactions.module.scss';

type PropsType = {
  transaction: TransactionInterface,
  amount: number,
  runningBalance: number,
  category: CategoryInterface,
}

const CategoryTransaction: React.FC<PropsType> = observer(({
  transaction,
  amount,
  runningBalance,
  category,
}) => {
  const { isMobile } = useMediaQuery();

  if (isMobile) {
    return (
      <>
        <div className={`${styles.transactionField} ${styles.transactionName}`}>{transaction.name}</div>
        <Amount className={`${styles.transactionField} ${styles.transactionAmount}`} amount={amount} />
        <div className={`${styles.transactionField} ${styles.transactionAccount} mobile`}>
          {
            transaction.instituteName !== ''
              ? `${transaction.instituteName}:${transaction.accountName}`
              : null
          }
        </div>
        <Amount className={`${styles.transactionField} ${styles.transactionRunningBalance} mobile`} amount={runningBalance} />
        <div className={`${styles.transactionField} ${styles.transactionOwner} mobile`}>{transaction.accountOwner}</div>
      </>
    );
  }

  const transactionAmount = () => {
    if (category.type === 'UNASSIGNED') {
      return null;
    }

    if (
      [
        TransactionType.FUNDING_TRANSACTION,
        TransactionType.REBALANCE_TRANSACTION,
      ].includes(transaction.type)
      || transaction.amount === amount
    ) {
      return <div />;
    }

    return <Amount className={`${styles.transactionField} currency`} amount={transaction.amount} />
  }

  return (
    <>
      <div className={styles.transactionField}>{transaction.name}</div>
      {transactionAmount()}
      <Amount className={`${styles.transactionField} currency`} amount={amount} />
      <Amount className={`${styles.transactionField} currency`} amount={runningBalance} />
      <div className={styles.transactionField}>{transaction.instituteName}</div>
      <div className={styles.transactionField}>{transaction.accountName}</div>
    </>
  );
});

export default CategoryTransaction;
