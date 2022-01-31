import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Application from 'App/Models/Application';
import { TransactionType } from 'Common/ResponseTypes';

type NetworthReportType = (string | number)[][];
type PayeeReportType = Record<string, unknown>[];
type IncomeVsExpensesReportType = [string, number, number, number][];
type FundingHistoryReportType = [string, number, number, number][];

class ReportController {
  // eslint-disable-next-line class-methods-use-this
  public async get({ request, auth: { user } }: HttpContextContract): Promise<NetworthReportType | PayeeReportType> {
    if (!user) {
      throw new Error('user not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    switch (request.params().report) {
      case 'networth':
        return ReportController.networth(application);

      case 'payee': {
        const {
          startDate,
          endDate,
          pc,
          a,
        } = request.qs();
        return ReportController.payee(application, startDate, endDate, pc, a);
      }

      case 'category': {
        const {
          startDate,
          endDate,
          c,
        } = request.qs();
        return ReportController.category(application, startDate, endDate, c);
      }

      case 'income-vs-expenses': {
        return ReportController.incomeVsExpenses(application)
      }

      case 'funding-history': {
        return ReportController.fundingHistory(application)
      }

      default:
        throw new Error('unknown report request');
    }
  }

  private static async networth(application: Application): Promise<NetworthReportType> {
    const listCategories = (categories: { name: string }[]): string => {
      let cats = '';

      categories.forEach((c) => {
        cats += `, "${c.name}" FLOAT`;
      });

      return cats;
    }

    const { days } = await Database.query()
      .select(Database.raw('current_date - min(date) as days'))
      .from((query) => {
        query.select(Database.raw('min(date) as date'))
          .from('balance_histories')
          .join('accounts', 'accounts.id', 'balance_histories.account_id')
          .join('institutions', 'institutions.id', 'accounts.institution_id')
          .where('application_id', application.id)
          .andWhere('accounts.closed', false)
          .union((query2) => {
            query2.select(Database.raw('min(date) as date'))
              .from('account_transactions as at')
              .join('transactions as t', 't.id', 'at.transaction_id')
              .join('accounts as a', 'a.id', 'at.account_id')
              .join('institutions as i', 'i.id', 'a.institution_id')
              .where('i.application_id', application.id)
              .andWhere('a.closed', false)
              .andWhere('a.tracking', '!=', 'Balances')
              .andWhereIn('t.type', [
                TransactionType.STARTING_BALANCE,
                TransactionType.REGULAR_TRANSACTION,
                TransactionType.MANUAL_TRANSACTION])
          })
          .as('union')
      })
      .first();

    let date = 'date::text'
    if (days > 10 * 365) {
      date = 'cast(date_trunc(\'year\', date) as date)';
    }
    else if (days > 2 * 365) {
      date = 'cast(date_trunc(\'month\', date) as date)';
    }
    else if (days > 0.5 * 365) {
      date = 'cast(date_trunc(\'week\', date) as date)';
    }

    const query = `
      select
        ${date} AS date,
        accounts.id || '_' || accounts.name AS name,
        max(CAST(hist.balance AS float)) AS balance
      from balance_histories AS hist
      join accounts ON accounts.id = hist.account_id
      join institutions ON institutions.id = accounts.institution_id
      where institutions.application_id = ${application.id}
      and accounts.tracking = 'Balances'
      group by ${date}, accounts.id
      union
      select
        date,
        id || '_' || name as name,
        sum(balance) over (partition by id order by id, date asc rows between unbounded preceding and current row) as balance
      from (
        select a.id, a.name, ${date} as date, sum(at.amount) as balance
        from account_transactions at
        join transactions t on t.id = at.transaction_id
        join accounts a on a.id = at.account_id
        join institutions i on i.id = a.institution_id
        where
          a.tracking != 'Balances'
          and t.type in (${[TransactionType.STARTING_BALANCE, TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION]}
          )
          and i.application_id = ${application.id}
        group by i.application_id, t.type, ${date}, a.id
      ) as daily
      order by date`;

    const categoryQuery = 'select accounts.id || \'_\' || accounts.name AS name '
    + 'from accounts '
    + 'join institutions ON institutions.id = accounts.institution_id '
    + `where institutions.application_id = ${application.id} `
    + 'order by name';

    const categories = await Database.rawQuery(categoryQuery);

    const crosstab = `SELECT * FROM crosstab($$${query}$$, $$${categoryQuery}$$) `
    + `AS (date TEXT ${listCategories(categories.rows)})`;

    const data = await Database.rawQuery(crosstab);

    // Move the data into the result object
    // Also, strip the account id off of the column names
    const result: (string | number)[][] = [['date'].concat(categories.rows
      .map((item) => item.name.replace(/\d+_/, '')))]
      .concat(data.rows.map((item) => Object.values(item)));

    // Fill in any gaps in balances
    for (let j = 1; j < result[1].length; j += 1) {
      if (result[1][j] === null) {
        result[1][j] = 0;
      }
    }

    for (let i = 2; i < result.length; i += 1) {
      for (let j = 1; j < result[i].length; j += 1) {
        if (result[i][j] === null) {
          result[i][j] = result[i - 1][j];
        }
      }
    }

    return result;
  }

  private static async payee(
    application: Application,
    startDate: string,
    endDate: string,
    pc?: string[] | string,
    a?: string[] | string,
  ): Promise<PayeeReportType> {
    if (pc !== undefined && a !== undefined) {
      const paymentColumn = 'coalesce(payment_channel, \'unknown\')';

      const query = Database.query()
        .select(
          Database.raw('row_number() over (order by coalesce(at.merchant_name, at.name)) as "rowNumber"'),
          Database.raw('coalesce(at.merchant_name, at.name) as "name"'),
          Database.raw(`${paymentColumn} as "paymentChannel"`),
          Database.raw('CAST(count(*) as integer) as count'),
          Database.raw('CAST(sum(amount) as float) as sum'),
        )
        .from('account_transactions as at')
        .join('transactions', 'transactions.id', 'at.transaction_id')
        .join('accounts', 'accounts.id', 'account_id')
        .join('institutions', 'institutions.id', 'accounts.institution_id')
        .where('pending', false)
        .andWhere('accounts.closed', false)
        .andWhereIn('transactions.type', [TransactionType.REGULAR_TRANSACTION, TransactionType.MANUAL_TRANSACTION])
        .andWhere('institutions.application_id', application.id)
        .groupBy(['payment_channel'])
        .groupByRaw('coalesce(at.merchant_name, at.name)')
        .orderByRaw('coalesce(at.merchant_name, at.name) asc')

      if (startDate) {
        query.andWhere('date', '>=', startDate);
      }

      if (endDate) {
        query.andWhere('date', '<=', endDate);
      }

      if (Array.isArray(pc)) {
        query.andWhereRaw(`${paymentColumn} in (${pc.map((p): string => {
          switch (p) {
            case 'instore': return '\'in store\'';
            case 'online': return '\'online\'';
            case 'other': return '\'other\'';
            default: return '\'unknown\'';
          }
        })})`);
      }
      else {
        query.andWhereRaw(`${paymentColumn} = ?`, [pc]);
      }

      if (Array.isArray(a)) {
        query.andWhereRaw(`accounts.id in (${a})`);
      }
      else {
        query.andWhereRaw('accounts.id = ?', [a]);
      }

      return query;
    }

    return [];
  }

  private static async category(
    application: Application,
    startDate: string,
    endDate: string,
    c?: string[] | string,
  ): Promise<PayeeReportType> {
    if (c !== undefined) {
      const query = Database.query()
        .select(
          Database.raw('row_number() over (order by g.name, c.name) as "rowNumber"'),
          'g.name as groupName',
          'c.name as categoryName',
          Database.raw('CAST(sum(tc.amount) as float) as sum'),
          Database.raw('CAST(count(*) as integer) as count'),
        )
        .from('transaction_categories as tc')
        .join('categories as c', 'c.id', 'tc.category_id')
        .join('groups as g', 'g.id', 'c.group_id')
        .join('transactions as t', 't.id', 'tc.transaction_id')
        .where('g.application_id', application.id)
        .andWhereIn('t.type', [TransactionType.MANUAL_TRANSACTION, TransactionType.REGULAR_TRANSACTION])
        .groupBy(['g.name', 'c.name'])
        .orderBy('g.name', 'asc')
        .orderBy('c.name', 'asc');

      if (startDate) {
        query.andWhere('t.date', '>=', startDate);
      }

      if (endDate) {
        query.andWhere('t.date', '<=', endDate);
      }

      if (Array.isArray(c)) {
        query.andWhereRaw(`c.id in (${c})`);
      }
      else {
        query.andWhereRaw('c.id = ?', [c]);
      }

      return query;
    }

    return [];
  }

  private static async incomeVsExpenses(
    application: Application,
  ): Promise<IncomeVsExpensesReportType> {
    const acctTransfer = await application.getAccountTransferCategory();

    const query = await Database.query()
      .select(
        Database.raw(
          'date_part(\'year\', date) || '
          + '\'-\' || lpad(cast(date_part(\'month\', date) as varchar), 2, \'0\') as month',
        ),
        // The tc.amount is for removing any amount that was an account transfer
        Database.raw('sum(CASE WHEN at.amount >= 0 THEN at.amount - COALESCE(tc.amount, 0) ELSE 0 END) as income'),
        Database.raw('sum(CASE WHEN at.amount < 0 THEN at.amount - COALESCE(tc.amount, 0) ELSE 0 END) as expenses'),
      )
      .from('transactions as t')
      .join('account_transactions as at', 'at.transaction_id', 't.id')
      .join('accounts as a', 'a.id', 'at.account_id')
      .leftJoin('transaction_categories as tc', (q) => {
        q.on('tc.transaction_id', 't.id')
          .andOnVal('category_id', '=', acctTransfer.id)
      })
      .where('t.application_id', application.id)
      .andWhere('a.tracking', 'Transactions')
      .andWhere('t.type', '!=', TransactionType.STARTING_BALANCE)
      .groupByRaw('date_part(\'year\', date) || \'-\' || lpad(cast(date_part(\'month\', date) as varchar), 2, \'0\')')
      .orderBy('month', 'asc');

    return query.map((row) => [
      row.month,
      parseFloat(row.income),
      parseFloat(row.expenses),
      parseFloat(row.income) + parseFloat(row.expenses),
    ]);
  }

  private static async fundingHistory(
    application: Application,
  ): Promise<FundingHistoryReportType> {
    const query = await Database.query()
      .select(
        'g.id as groupId',
        'g.name as groupName',
        'g.type as groupType',
        'c.id as categoryId',
        'c.name as categoryName',
        Database.raw(`(
          select json_agg(monthly_amount)
          from (
            select 
              json_build_object(
                'year', EXTRACT(YEAR FROM t.date),
                'month', EXTRACT(MONTH FROM t.date),
                'amount', sum(tc.amount)) AS monthly_amount
            from transaction_categories AS tc
            join transactions as t on t.id = tc.transaction_id and t.type = 2
            where tc.category_id = c.id
            group by EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
          ) as amounts
        ) as history`),
      )
      .from('categories AS c')
      .join('groups as g', 'g.id', 'c.group_id')
      .where('c.type', '!=', 'FUNDING POOL')
      .andWhere('g.application_id', application.id)
      .orderBy('g.name')
      .orderBy('c.name');

    return query;
  }
}

export default ReportController;
