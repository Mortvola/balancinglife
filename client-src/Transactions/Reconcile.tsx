import React from 'react';
import { BaseTransactionInterface } from '../State/State';
import styles from './Transactions.module.scss';

type PropsType = {
  transaction: BaseTransactionInterface,
}

const Reconcile: React.FC<PropsType> = ({
  transaction,
}) => {
  const handleReconcileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    transaction.toggleReconciled();
  };

  const handleReconcileClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();
  };

  return (
    <input
      type="checkbox"
      className={styles.reconcile}
      checked={transaction.reconciled}
      onChange={handleReconcileChange}
      onClick={handleReconcileClick}
    />
  );
}

export default Reconcile;
