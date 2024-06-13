/* eslint-disable import/no-cycle */
import {
  BaseModel, hasMany, HasMany, column,
  belongsTo, BelongsTo, HasOne, hasOne,
} from '@ioc:Adonis/Lucid/Orm';
import { DateTime } from 'luxon';
import TransactionCategory from 'App/Models/TransactionCategory';
import AccountTransaction from 'App/Models/AccountTransaction';
import { TransactionType } from 'Common/ResponseTypes';
import Budget from 'App/Models/Budget';

class Transaction extends BaseModel {
  @column()
  public id: number;

  @column.dateTime({ serializeAs: null })
  public createdAt: DateTime;

  @column.date()
  public date: DateTime;

  @hasMany(() => TransactionCategory)
  public transactionCategories: HasMany<typeof TransactionCategory>;

  @column()
  public sortOrder: number;

  @column()
  public type: TransactionType;

  @hasOne(() => AccountTransaction)
  public accountTransaction: HasOne<typeof AccountTransaction>

  @belongsTo(() => Budget)
  public budget: BelongsTo<typeof Budget>;

  @column({ serializeAs: null, columnName: 'application_id' })
  public budgetId: number;

  @column()
  public comment: string;

  @column({ serializeAs: null })
  public deleted: boolean;

  @column()
  public duplicateOfTransactionId: number | null;

  @column()
  public version: number;
}

export default Transaction;
