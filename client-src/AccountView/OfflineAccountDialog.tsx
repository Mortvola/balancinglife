import {
  FieldProps, FormikErrors, FormikHelpers, useFormikContext,
} from 'formik';
import React, { ReactElement, useContext } from 'react';
import useModal, { ModalProps, UseModalType } from '@mortvola/usemodal';
import { Error, TrackingType } from '../../common/ResponseTypes';
import AmountInput from '../AmountInput';
import FormField from '../Modal/FormField';
import FormModal from '../Modal/FormModal';
import FormTextField from '../Modal/FormTextField';
import MobxStore from '../State/mobxStore';
import { AccountInterface, InstitutionInterface } from '../State/State';
import { getSubtypes, getTypes } from '../State/AccountTypes';

type PropsType = {
  institution?: InstitutionInterface,
  account?: AccountInterface | null,
  onHide?: () => void,
}

type ValuesType = {
  institute: string,
  account: string,
  balance: string,
  startDate: string,
  type: string,
  subtype: string,
  tracking: TrackingType,
  rate: string,
};

const APRField = () => {
  const { values } = useFormikContext<ValuesType>();

  if (values.type === 'loan') {
    return (
      <FormField
        name="rate"
        label="Annual Percentage Rate (APR):"
        as={AmountInput}
      />
    )
  }

  return null;
}

const OfflineAccountDialog = ({
  institution,
  account = null,
  show,
  setShow,
  onHide,
}: PropsType & ModalProps): ReactElement => {
  const { accounts, uiState } = useContext(MobxStore);

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};

    if (!values.institute) {
      errors.institute = 'Institution name is required';
    }

    if (!account) {
      if (!values.account) {
        errors.account = 'Account name is required';
      }

      if (!values.startDate) {
        errors.startDate = 'Start date is required';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType, bag: FormikHelpers<ValuesType>) => {
    const { setErrors } = bag;

    let errors: Error[] | null = null;

    if (institution) {
      if (account) {
        await account.updateOfflineAccount(values.account);
      }
      else {
        errors = await institution.addOfflineAccount(
          values.account, parseFloat(values.balance), values.startDate,
          values.type, values.subtype, values.tracking, parseFloat(values.rate),
        );
      }
    }
    else {
      errors = await accounts.addOfflineAccount(
        values.institute, values.account, parseFloat(values.balance), values.startDate,
        values.type, values.subtype, values.tracking, parseFloat(values.rate),
      );
    }

    if (errors) {
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = () => {
    if (account) {
      account.delete();
      if (uiState.selectedAccount === account) {
        uiState.selectAccount(null);
      }
      setShow(false);
    }
  }

  const subtypeList = ({ field, form }: FieldProps<string, ValuesType>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={field.onChange}
      onBlur={field.onBlur}
    >
      {
        (() => (
          getSubtypes(form.values.type).map((subtype) => (
            <option key={subtype.key} value={subtype.key}>{subtype.name}</option>
          ))
        ))()
      }
    </select>
  )

  const typelist = ({ field, form }: FieldProps<string, ValuesType>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
        const subTypes = getSubtypes(e.target.value);

        if (subTypes.length > 0) {
          form.setFieldValue('subtype', subTypes[0].key, false);
        }

        field.onChange(e);
      }}
      onBlur={field.onBlur}
    >
      {
        getTypes().map((t) => (
          <option key={t.key} value={t.key}>{t.name}</option>
        ))
      }
    </select>
  )

  return (
    <FormModal<ValuesType>
      initialValues={{
        institute: institution ? institution.name : '',
        account: account ? account.name : '',
        balance: account ? account.balance.toString() : '0',
        startDate: '',
        type: 'depository',
        subtype: 'checking',
        tracking: 'Transactions',
        rate: '0',
      }}
      show={show}
      setShow={setShow}
      onHide={onHide}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Add Offline Account"
      formId="UnlinkedAccounts"
      onDelete={account ? handleDelete : null}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(45%, 1fr))',
          gridGap: '0.5rem',
        }}
      >
        <FormTextField name="institute" label="Institution Name:" readOnly={institution !== undefined} />
        <FormTextField name="account" label="Account Name:" />
        {
          !account
            ? (
              <>
                <FormField name="balance" label="Starting Balance:" as={AmountInput} />
                <FormField name="startDate" label="Start Date:" type="date" />
                <FormField name="type" label="Account Type:">
                  {typelist}
                </FormField>
                <FormField name="subtype" label="Account Subtype:">
                  {subtypeList}
                </FormField>
                <APRField />
                <FormField name="tracking" label="Tracking:" as="select">
                  <option value="Transactions">Categorized Transactions</option>
                  <option value="Uncategorized Transactions">Uncategorized Transactions</option>
                  <option value="Balances">Balances</option>
                </FormField>
              </>
            )
            : null
        }
      </div>
    </FormModal>
  );
}

export const useOfflineAccountDialog = (): UseModalType<PropsType> => useModal<PropsType>(OfflineAccountDialog);

export default OfflineAccountDialog;
