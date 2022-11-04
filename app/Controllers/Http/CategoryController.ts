import Database, { StrictValues } from '@ioc:Adonis/Lucid/Database';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Category, { GroupItem } from 'App/Models/Category';
import CategoryTransfer from 'App/Models/CategoryTransfer';
import { GroupHistoryItem } from 'App/Models/GroupHistoryItem';
import AddGroupValidator from 'App/Validators/AddGroupValidator';
import UpdateGroupValidator from 'App/Validators/UpdateGroupValidator';
import DeleteGroupValidator from 'App/Validators/DeleteGroupValidator';
import AddCategoryValidator from 'App/Validators/AddCategoryValidator';
import UpdateCategoryValidator from 'App/Validators/UpdateCategoryValidator';
import DeleteCategoryValidator from 'App/Validators/DeleteCategoryValidator';
import UpdateCategoryTransferValidator from 'App/Validators/UpdateCategoryTransferValidator';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';
import {
  CategoryBalanceProps,
  TransactionsResponse,
  TransactionProps, TransactionType,
} from 'Common/ResponseTypes';
import Group from 'App/Models/Group';
import transactionFields from './transactionFields';
import { DateTime } from 'luxon';

class CategoryController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    auth: { user },
  }: HttpContextContract): Promise<Group[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    return await application.related('groups').query()
      .preload('categories', (catQuery) => {
        catQuery.orderBy('name', 'asc')
      })
      .orderBy('name', 'asc');
  }

  // eslint-disable-next-line class-methods-use-this
  public async addGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Group> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate(AddGroupValidator);

    const group = await new Group()
      .fill({
        name: requestData.name,
        applicationId: user.applicationId,
        type: 'REGULAR',
      })
      .save();

    return group;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    const requestData = await request.validate(UpdateGroupValidator);

    const group = await Group.findOrFail(groupId);

    group.merge({
      name: requestData.name,
      hidden: requestData.hidden,
    });

    await group.save();

    return { id: groupId, name: group.name, hidden: group.hidden };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { groupId } = request.params();
    await request.validate(DeleteGroupValidator);

    const group = await Group.findOrFail(groupId);

    await group.delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async addCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    const { groupId } = request.params();
    const requestData = await request.validate(AddCategoryValidator);

    const category = new Category();

    await category
      .fill({
        groupId: parseInt(groupId, 10),
        name: requestData.name,
        amount: 0,
        monthlyExpenses: requestData.monthlyExpenses,
        type: 'REGULAR',
      })
      .save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    const { groupId, catId } = request.params();
    const requestData = await request.validate(UpdateCategoryValidator);

    const category = await Category.findOrFail(catId);

    category.merge({
      name: requestData.name,
      monthlyExpenses: requestData.monthlyExpenses,
      groupId,
      hidden: requestData.hidden,
    });

    await category.save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request, logger }: HttpContextContract): Promise<void> {
    const { catId } = request.params();
    await request.validate(DeleteCategoryValidator);

    const trx = await Database.transaction();

    try {
      const category = await Category.findOrFail(catId, { client: trx });

      if (category.type === 'LOAN') {
        const loan = await Loan.findBy('categoryId', catId, { client: trx });

        if (loan) {
          await loan.delete();
        }
      }

      await category.delete();

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async transactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    const { catId } = request.params();

    const categoryId = parseInt(catId, 10);

    const result: TransactionsResponse = {
      transactions: [],
      balance: 0,
    };

    const cat = await Category.findOrFail(categoryId);

    result.balance = cat.amount;

    const transactions = await cat.transactions(application, request.qs().limit, request.qs().offset);

    result.transactions = transactions.map((t) => (
      t.serialize(transactionFields) as TransactionProps
    ));

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async pendingTransactions({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionProps[]> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    const { catId } = request.params();

    const categoryId = parseInt(catId, 10);

    let pending: Transaction[] = [];

    const cat = await Category.findOrFail(categoryId);

    if (cat.type === 'UNASSIGNED') {
      pending = await application
        .related('transactions').query()
        .where((query) => {
          query
            .doesntHave('transactionCategories')
            .orWhereHas('transactionCategories', (q) => {
              q.where('categoryId', cat.id);
            })
        })
        .whereHas('accountTransaction', (q2) => {
          q2.where('pending', true)
            .andWhereHas('account', (q3) => {
              q3.where('tracking', 'Transactions')
            })
        })
        .orderBy('date', 'desc')
        .orderBy('transactions.id', 'desc')
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories');
    }

    return pending.map((p) => p.serialize(transactionFields) as TransactionProps);
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user }, logger }: HttpContextContract,
  ): Promise<{ balances: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    const { tfrId } = request.params();
    const requestData = await request.validate(UpdateCategoryTransferValidator);

    const trx = await Database.transaction();

    try {
      const result: {
        balances: CategoryBalanceProps[],
        transaction: {
          transactionCategories: unknown[],
          id?: number,
          date?: string,
          name?: string,
          pending?: boolean,
          sortOrder?: number,
          type?: TransactionType,
          accountName?: string | null,
          amount?: string | null,
          institutionName?: string | null,
        },
      } = { balances: [], transaction: { transactionCategories: [] } };

      const { categories } = requestData;
      if (Array.isArray(categories)) {
        const { date, type } = requestData;
        let transaction: Transaction;

        if (tfrId === undefined) {
          transaction = await new Transaction()
            .useTransaction(trx)
            .fill({
              date: DateTime.fromISO(date), type, applicationId: application.id,
            })
            .save()

          result.transaction = {
            id: transaction.id,
            date,
            name: type === TransactionType.FUNDING_TRANSACTION ? 'Category Funding' : 'Category Rebalance',
            pending: false,
            sortOrder: 2147483647,
            type,
            accountName: null,
            amount: null,
            institutionName: null,
            transactionCategories: [],
          };
        }
        else {
          transaction = await Transaction.findOrFail(tfrId, { client: trx });

          await transaction
            .merge({
              date: DateTime.fromISO(date),
            })
            .save()
        }

        const existingSplits: StrictValues[] = [];

        // Insert the category splits
        // eslint-disable-next-line no-restricted-syntax
        for (const split of categories) {
          if (split.amount !== 0) {
            let { amount } = split;

            if (split.id) {
              existingSplits.push(split.id);

              // eslint-disable-next-line no-await-in-loop
              const existingSplit = await TransactionCategory.findOrFail(split.id, { client: trx });

              amount = split.amount - existingSplit.amount;

              existingSplit.amount = split.amount;

              if (split.expected !== undefined) {
                existingSplit.expected = split.expected;
              }

              existingSplit.save();
            }
            else {
              const newSplit = (new TransactionCategory()).useTransaction(trx);

              // eslint-disable-next-line no-await-in-loop
              await newSplit
                .fill({
                  transactionId: transaction.id,
                  categoryId: split.categoryId,
                  amount: split.amount,
                  expected: split.expected,
                })
                .save();

              existingSplits.push(newSplit.id);

              amount = split.amount;
            }

            // eslint-disable-next-line no-await-in-loop
            const category = await Category.findOrFail(split.categoryId, { client: trx });

            category.amount += amount;

            category.save();

            result.balances.push({ id: category.id, balance: category.amount });
          }
        }

        // Delete splits that are not in the array of ids
        const query = trx
          .from('transaction_categories')
          .whereNotIn('id', existingSplits)
          .andWhere('transaction_id', transaction.id);
        const toDelete = await query.select('category_id AS categoryId', 'amount');

        // eslint-disable-next-line no-restricted-syntax
        for (const td of toDelete) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(td.categoryId, { client: trx });

          category.amount -= td.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();
        }

        await query.delete();

        result.transaction.transactionCategories = await transaction.related('transactionCategories').query();
      }

      await trx.commit();

      return result;
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async transferDelete({ request, logger }: HttpContextContract): Promise<void> {
    const trx = await Database.transaction();

    try {
      const { tfrId } = request.params();

      const categoryTransfer = await CategoryTransfer.findOrFail(tfrId, { client: trx });

      const categorySplits = await categoryTransfer.splits(trx);

      // eslint-disable-next-line no-restricted-syntax
      for (const cs of categorySplits) {
        // eslint-disable-next-line no-await-in-loop
        const category = await Category.find(cs.categoryId, { client: trx });

        if (category) {
          category.amount -= cs.amount;

          category.save();

          // eslint-disable-next-line no-await-in-loop
          await cs.delete();
        }
      }

      await categoryTransfer.delete();

      await trx.commit();
    }
    catch (error) {
      await trx.rollback();
      logger.error(error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async balances({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Array<GroupItem>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const application = await user.related('application').query().firstOrFail();

    const { date, id } = request.qs();

    return Category.balances(application, date, id !== undefined ? parseInt(id, 10) : id);
  }
}

export default CategoryController;
export { GroupHistoryItem };
