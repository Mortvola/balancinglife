/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import Database from '@ioc:Adonis/Lucid/Database';
import Group from 'App/Models/Group';
import { CategoryType } from 'Common/ResponseTypes';
import TransactionCategory from 'App/Models/TransactionCategory';
import Budget from 'App/Models/Budget';
import { DateTime } from 'luxon';

type CategoryItem = {
  id: number,
  name: string,
  type: CategoryType,
  balance: number,
};

type GroupItem = {
  id: number,
  name: string,
  system: boolean,
  categories: (CategoryItem | { id: number, name: string})[],
};

export default class Category extends BaseModel {
  @column()
  public id: number;

  @belongsTo(() => Group)
  public group: BelongsTo<typeof Group>;

  @column()
  public name: string;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public balance: number;

  @column()
  public monthlyExpenses: boolean;

  @column()
  public type: CategoryType;

  @column()
  public groupId: number;

  @column()
  public hidden: boolean;

  @column({
    consume: (value: string) => parseFloat(value),
  })
  public fundingAmount: number;

  @column()
  public useGoal: boolean;

  @column.date()
  public goalDate: DateTime | null;

  @column()
  public recurrence: number;

  @hasMany(() => TransactionCategory)
  public transactionCategory: HasMany<typeof TransactionCategory>;

  public static async balances(
    budget: Budget,
    date: string,
    transactionId: number,
  ): Promise<GroupItem[]> {
    const subQuery = Database.query()
      .select('category_id', Database.raw('sum(amount) as amount'))
      .from('transaction_categories as tc')
      .join('transactions as t', 't.id', 'tc.transaction_id')
      .where('date', '>', date)
      .groupBy('category_id');

    // Ignore he transaction identified by transactionId, if any
    if (transactionId !== undefined) {
      subQuery.orWhere('t.id', transactionId);
    }

    const query = Database.query()
      .select(
        'c.id',
        Database.raw('CAST(c.balance - sum(coalesce(tc.amount, 0)) as float) as balance'),
      )
      .from('categories as c')
      .join('groups as g', 'g.id', 'c.group_id')
      .joinRaw(`left join (${
        subQuery.toQuery()
      }) as tc on tc.category_id = c.id`)
      .where('g.application_id', budget.id)
      .groupBy('c.id')
      .groupByRaw('coalesce(tc.amount, 0)')

    return query;
  }

  private getTransactionQuery(budget: Budget, pending: boolean) {
    return budget
      .related('transactions').query()
      .where('deleted', false)
      .whereHas('transactionCategories', (query) => {
        query.where('categoryId', this.id);
      })
      .where((q) => {
        q.whereHas('accountTransaction', (q2) => {
          q2
            .where('pending', pending)
            .andWhereHas('account', (q3) => {
              q3.where('tracking', 'Transactions')
                .andWhereColumn('startDate', '<=', 'transactions.date')
            })
        })
          .orDoesntHave('accountTransaction')
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      })
  }

  public async transactions(budget: Budget, pending: boolean, limit?: number, offset?: number) {
    const transactionQuery = this.getTransactionQuery(budget, pending);

    transactionQuery
      .orderBy('transactions.date', 'desc')
      .orderByRaw('COALESCE(transactions.duplicate_of_transaction_id, transactions.id) desc')
      .orderBy('transactions.id', 'desc')

    if (limit !== undefined) {
      transactionQuery
        .limit(limit)
    }

    if (offset !== undefined) {
      transactionQuery
        .offset(offset);
    }

    return transactionQuery;
  }

  public async syncBalance(this: Category): Promise<void> {
    let sum = 0;

    const tc = await this.related('transactionCategory').query()
      .sum('amount')
      .whereHas('transaction', (q) => {
        q.whereHas('accountTransaction', (q2) => {
          q2.where('pending', false)
            .whereHas('account', (q3) => {
              q3.where('tracking', 'Transactions')
                .whereColumn('startDate', '<=', 'transactions.date')
            })
        })
          .orDoesntHave('accountTransaction')
      })

    sum = tc[0].$extras.sum ?? 0;

    await this.merge({
      balance: sum,
    })
      .save();
  }
}

export { GroupItem, CategoryItem };
