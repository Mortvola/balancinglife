/* eslint-disable import/no-cycle */
import {
  BaseModel, BelongsTo, belongsTo, column, HasMany, hasMany,
} from '@ioc:Adonis/Lucid/Orm';
import Database from '@ioc:Adonis/Lucid/Database';
import Group from 'App/Models/Group';
import { CategoryType } from 'Common/ResponseTypes';
import TransactionCategory from 'App/Models/TransactionCategory';
import Application from './Application';

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
    serializeAs: 'balance',
    consume: (value: string) => parseFloat(value),
  })
  public amount: number;

  @column()
  public type: CategoryType;

  @column()
  public groupId: number;

  @hasMany(() => TransactionCategory)
  public transactionCategory: HasMany<typeof TransactionCategory>;

  public static async balances(
    application: Application,
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
        Database.raw('CAST(c.amount - sum(coalesce(tc.amount, 0)) as float) as balance'),
      )
      .from('categories as c')
      .join('groups as g', 'g.id', 'c.group_id')
      .joinRaw(`left join (${
        subQuery.toQuery()
      }) as tc on tc.category_id = c.id`)
      .where('g.application_id', application.id)
      .groupBy('c.id')
      .groupByRaw('coalesce(tc.amount, 0)')

    return query;
  }
}

export { GroupItem, CategoryItem };
