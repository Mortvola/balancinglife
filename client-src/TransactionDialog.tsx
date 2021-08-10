/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useState, useContext } from 'react';
import {
  Field, ErrorMessage, FieldProps,
  FormikErrors,
  FormikContextType,
} from 'formik';
import CategorySplits from './CategorySplits';
import useModal, { ModalProps, useModalType } from './Modal/useModal';
import Amount from './Amount';
import Transaction from './state/Transaction';
import { AccountInterface, CategoryInterface, TransactionCategoryInterface } from './state/State';
import FormError from './Modal/FormError';
import AmountInput from './AmountInput';
import FormModal from './Modal/FormModal';
import MobxStore from './state/mobxStore';


function validateSplits(splits: Array<TransactionCategoryInterface>) {
  let error;

  if (splits !== undefined) {
    if (splits.some((split) => split.categoryId === null || split.categoryId === undefined)) {
      error = 'There are one or more items not assigned a category.';
    }
  }

  return error;
}

type PropsType = {
  transaction?: Transaction | null,
  account?: AccountInterface | null,
  category?: CategoryInterface | null,
}

const TransactionDialog = ({
  show,
  onHide,
  transaction = null,
  category = null,
  account = null,
}: PropsType & ModalProps): ReactElement => {
  const { categoryTree: { systemIds } } = useContext(MobxStore);

  const showBalances = category ? category.id === systemIds.unassignedId : false;

  type ValueType = {
    date: string,
    name: string,
    amount: number,
    splits: TransactionCategoryInterface[],
  }

  const computeRemaining = (categories: TransactionCategoryInterface[], total: number, sign = 1) => {
    let sum = 0;
    if (categories) {
      sum = categories.reduce((accum: number, item) => {
        if (item.categoryId !== undefined && item.categoryId !== systemIds.unassignedId) {
          return accum + item.amount;
        }

        return accum;
      }, 0);
    }

    return Math.abs(total) - sign * sum;
  };

  const [remaining, setRemaining] = useState(() => {
    if (transaction) {
      return computeRemaining(transaction.categories, transaction.amount, Math.sign(transaction.amount));
    }

    return 0;
  });

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.splits.length > 0) {
      const sum = values.splits.reduce(
        (accum: number, item: TransactionCategoryInterface) => accum + Math.round(item.amount * 100),
        0,
      );
  
      if (sum !== Math.abs(Math.round(values.amount * 100))) {
        errors.splits = 'The sum of the categories does not match the transaction amount.';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValueType) => {
    const amount = typeof values.amount === 'string' ? parseFloat(values.amount) : values.amount;

    // If the transaction amount is less then zero then
    // negate all of the category amounts.
    if (amount < 0) {
      values.splits.forEach((element) => {
        element.amount *= -1;
      });
    }

    let errors;
    if (transaction) {
      errors = await transaction.updateTransaction({
        name: values.name,
        date: values.date,
        amount,
        splits: values.splits,
      });
    }
    else {
      if (!account) {
        throw new Error('account is null');
      }

      errors = await account.addTransaction({
        name: values.name,
        date: values.date,
        amount,
        splits: values.splits,
      });
    }

    if (!errors) {
      onHide();
    }
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = bag;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors && errors.length > 0) {
        setTouched({ [errors[0].field]: true }, false);
        setErrors({ [errors[0].field]: errors[0].message });
      }
    }
  };

  const renderBalanceHeaders = () => {
    if (showBalances) {
      return (
        <>
          <div className="dollar-amount">Current Balance</div>
          <div className="dollar-amount">New Balance</div>
        </>
      );
    }

    return null;
  };

  let splitItemClass = 'transaction-split-item';
  if (!showBalances) {
    splitItemClass += ' no-balances';
  }

  return (
    <FormModal<ValueType>
      initialValues={{
        date: transaction ? transaction.date : '',
        name: transaction ? transaction.name : '',
        amount: transaction ? transaction.amount : 0,
        splits: transaction
          ? transaction.categories.map((c) => ({
            ...c,
            amount: transaction.amount < 0 ? -c.amount : c.amount,
          }))
          : [],
      }}
      show={show}
      onHide={onHide}
      size={showBalances ? 'lg' : undefined}
      title="Transaction"
      formId="transactionDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={transaction ? handleDelete : null}
    >
      <label>
        Date:
        <Field className="form-control" type="date" name="date" />
      </label>
      <label>
        Name:
        <Field
          type="text"
          className="form-control"
          name="name"
        />
        <FormError name="name" />
      </label>
      <label>
        Amount:
        <Field
          name="amount"
        >
          {
            ({ field, form: { values, touched }, meta }: FieldProps<string | number, ValueType>) => (
              <AmountInput
                className="form-control"
                {...field}
                onBlur={(v) => {
                  setRemaining(computeRemaining(values.splits, parseFloat(v.target.value)));
                }}
              />
            )
          }
        </Field>
        <FormError name="amount" />
      </label>
      <div className="cat-fund-table">
        <div className={`${splitItemClass} cat-fund-title`}>
          <div className="fund-list-cat-name">Category</div>
          <div className="dollar-amount">Amount</div>
          {renderBalanceHeaders()}
        </div>
        <Field name="splits" validate={validateSplits}>
          {({
            field: {
              value,
              name,
            },
            form: {
              setFieldValue,
              values,
            },
          }: FieldProps<TransactionCategoryInterface[]>) => (
            <CategorySplits
              splits={value}
              total={Math.abs(typeof(values.amount) === 'string' ? parseFloat(values.amount) : values.amount)}
              showBalances={showBalances}
              onChange={(splits) => {
                setFieldValue(name, splits);
                setRemaining(computeRemaining(splits, typeof(values.amount) === 'string' ? parseFloat(values.amount) : values.amount));
              }}
            />
          )}
        </Field>
        <ErrorMessage name="splits" />

        <div className={splitItemClass}>
          {showBalances ? <div /> : null}
          <div className="unassigned-label">Unassigned:</div>
          <Amount amount={remaining} />
        </div>
      </div>
    </FormModal>
  );
};

export const useTransactionDialog = (): useModalType<PropsType> => useModal<PropsType>(TransactionDialog);

export default TransactionDialog;
