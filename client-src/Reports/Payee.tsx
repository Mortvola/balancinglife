import { Formik, Form } from 'formik';
import { DateTime } from 'luxon';
import React, { ReactElement, useState } from 'react';
import { Button } from 'react-bootstrap';
import FormField from '../Modal/FormField';
import { getBody, httpGet } from '../state/Transports';

type PayeeReport = {
  rowNumber: string,
  name: string,
  mask: string,
  // eslint-disable-next-line camelcase
  payment_channel: string,
  count: number,
};

export const isPayeeReport = (r: unknown): r is PayeeReport[] => (
  Array.isArray(r)
  && (r.length === 0 || (
    (r as PayeeReport[])[0].name !== undefined
  ))
)

const Payee = (): ReactElement | null => {
  const [data, setData] = useState<PayeeReport[]>([]);

  type FormValues = {
    startDate: string,
    endDate: string,
  }

  const handleSubmit = async (values: FormValues): Promise<void> => {
    const response = await httpGet(`/api/reports/payee?startDate=${values.startDate}&endDate=${values.endDate}`);

    if (response.ok) {
      const body = await getBody(response);

      if (isPayeeReport(body)) {
        setData(body);
      }
    }
  }

  return (
    <div className="payee-report window">
      <Formik<FormValues>
        initialValues={{
          startDate: DateTime.now().minus({ years: 1 }).toISODate(),
          endDate: DateTime.now().toISODate(),
        }}
        onSubmit={handleSubmit}
      >
        <Form>
          <FormField name="startDate" type="date" label="Start Date:" />
          <FormField name="endDate" type="date" label="End Date:" />
          <Button variant="primary" type="submit">Run Report</Button>
        </Form>
      </Formik>
      <div className="title payee-report-item">
        <div>Name</div>
        <div>Mask</div>
        <div>Channel</div>
        <div>Count</div>
      </div>
      <div className="striped">
        {
          data !== null
            ? (
              data.map((d) => (
                <div key={d.rowNumber} className="payee-report-item">
                  <div className="ellipsis">{d.name}</div>
                  <div>{d.mask}</div>
                  <div>{d.payment_channel}</div>
                  <div style={{ textAlign: 'right' }}>{d.count}</div>
                </div>
              ))
            )
            : null
        }
      </div>
    </div>
  )
}

export default Payee;
