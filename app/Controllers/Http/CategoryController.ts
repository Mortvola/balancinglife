import Database, { StrictValues } from '@ioc:Adonis/Lucid/Database';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Category, { GroupItem } from 'App/Models/Category';
import CategoryTransfer from 'App/Models/CategoryTransfer';
import { GroupHistoryItem } from 'App/Models/User';
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
  AddCategoryResponse, LoanTransactionProps, TransactionProps, TransactionType, UpdateCategoryResponse,
} from 'Common/ResponseTypes';

type TransactionsResponse = {
  transactions: TransactionProps[],
  pending: TransactionProps[],
  loan: {
    balance: number,
    transactions: LoanTransactionProps[],
  }
  balance: number,
}

class CategoryController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    auth: { user },
  }: HttpContextContract): Promise<Array<Record<string, unknown>>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const rows = await Database.query()
      .select(
        'g.id AS groupId',
        'g.name AS groupName',
        'g.system AS systemGroup',
        'c.id AS categoryId',
        'c.name as categoryName',
        'c.type',
        Database.raw('CAST(amount AS float) as balance'),
      )
      .from('groups AS g')
      .leftJoin('categories AS c', 'c.group_id', 'g.id')
      .where('user_id', user.id)
      .orderBy('g.name')
      .orderBy('c.name');

    const groups: GroupItem[] = [];
    // let group: GroupItem | null = null;

    // Create a tree structure with groups at the top level
    // and categories within each group.
    await Promise.all(rows.map(async (cat) => {
      let group = groups.find((g) => (g.id === cat.groupId));
      if (!group) {
        group = {
          id: cat.groupId,
          name: cat.groupName,
          system: cat.systemGroup,
          categories: [],
        };

        groups.push(group);
      }

      if (cat.categoryId) {
        group.categories.push({
          id: cat.categoryId,
          name: cat.categoryName,
          type: cat.type,
          balance: cat.balance,
        });
      }
    }));

    return groups;
  }

  // eslint-disable-next-line class-methods-use-this
  public async addGroup({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }
    await request.validate(AddGroupValidator);

    const id = await Database.insertQuery().table('groups')
      .insert({ name: request.input('name'), user_id: user.id })
      .returning('id');

    return {
      id: id[0],
      name: request.input('name'),
      system: false,
      categories: [],
    };
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

    await request.validate(UpdateGroupValidator);

    await Database.query().from('groups')
      .where({ id: request.params().groupId, user_id: user.id })
      .update({ name: request.input('name') });

    return { id: request.params().groupId, name: request.input('name') };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteGroup({ request, auth: { user } }: HttpContextContract): Promise<void> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await request.validate(DeleteGroupValidator);

    await Database.query().from('groups').where({ id: request.params().groupId, user_id: user.id }).delete();
  }

  // eslint-disable-next-line class-methods-use-this
  public async addCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    await request.validate(AddCategoryValidator);

    const category = new Category();

    await category
      .fill({ groupId: parseInt(request.params().groupId, 10), name: request.input('name'), amount: 0 })
      .save();

    return category;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<UpdateCategoryResponse> {
    await request.validate(UpdateCategoryValidator);

    const { catId } = request.params();
    const name = request.input('name');

    await Database.query().from('categories').where({ id: catId }).update({ name });

    return { name };
  }

  // eslint-disable-next-line class-methods-use-this
  public async deleteCategory({ request }: HttpContextContract): Promise<void> {
    await request.validate(DeleteCategoryValidator);

    const trx = await Database.transaction();
    const category = await Category.findOrFail(request.params().catId, { client: trx });

    if (category.type === 'LOAN') {
      const loan = await Loan.findBy('categoryId', request.params().catId, { client: trx });

      if (loan) {
        await loan.delete();
      }
    }

    await category.delete();

    await trx.commit();
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

    const categoryId = parseInt(request.params().catId, 10);

    const result: TransactionsResponse = {
      transactions: [],
      pending: [],
      loan: {
        balance: 0,
        transactions: [],
      },
      balance: 0,
    };

    const cat = await Category.findOrFail(categoryId);

    result.balance = cat.amount;

    if (cat.type === 'UNASSIGNED') {
      const transactions = await user
        .related('transactions').query()
        .doesntHave('transactionCategories')
        .orWhereHas('transactionCategories', (query) => {
          query.where('categoryId', cat.id);
        })
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories');

      result.transactions = transactions.map((t) => (
        t.serialize() as TransactionProps
      ));
    }
    else {
      const transactions = await user
        .related('transactions').query()
        .whereHas('transactionCategories', (query) => {
          query.where('categoryId', cat.id);
        })
        .preload('accountTransaction', (accountTransaction) => {
          accountTransaction.preload('account', (account) => {
            account.preload('institution');
          });
        })
        .preload('transactionCategories', (transactionCategory) => {
          transactionCategory.preload('loanTransaction');
        });

      result.transactions = transactions.map((t) => (
        t.serialize() as TransactionProps
      ));

      if (cat.type === 'LOAN') {
        const loan = await Loan.findByOrFail('categoryId', cat.id);

        result.loan = await loan.getProps();
      }
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transfer(
    { request, auth: { user } }: HttpContextContract,
  ): Promise<{ balances: { id: number, balance: number}[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    await request.validate(UpdateCategoryTransferValidator);

    const trx = await Database.transaction();
    const result: {
      balances: Array<{ id: number, balance: number}>,
      transaction: {
        transactionCategories: unknown[],
        id?: number,
        date?: string,
        name?: string,
        pending?: boolean,
        sortOrder?: number,
        type?: number,
        accountName?: string | null,
        amount?: string | null,
        institutionName?: string | null,
      },
    } = { balances: [], transaction: { transactionCategories: [] } };

    try {
      const categories = request.input('categories');
      if (Array.isArray(categories)) {
        const date = request.input('date');
        const type = request.input('type');
        let transactionId = request.params().tfrId;

        if (transactionId === undefined) {
          [transactionId] = await trx.insertQuery().insert({
            date, type, user_id: user.id,
          }).table('transactions').returning('id');

          result.transaction = {
            id: transactionId,
            date,
            name: type === 2 ? 'Category Funding' : 'Category Rebalance',
            pending: false,
            sortOrder: 2147483647,
            type,
            accountName: null,
            amount: null,
            institutionName: null,
            transactionCategories: [],
          };
        }

        const existingSplits: StrictValues[] = [];

        // Insert the category splits
        await Promise.all(categories.map(async (split) => {
          if (split.amount !== 0) {
            let { amount } = split;

            if (split.id) {
              existingSplits.push(split.id);

              const existingSplit = await TransactionCategory.findOrFail(split.id, { client: trx });

              amount = split.amount - existingSplit.amount;

              existingSplit.amount = split.amount;
              existingSplit.save();
            }
            else {
              const newSplit = (new TransactionCategory()).useTransaction(trx);

              await newSplit
                .fill({ transactionId, categoryId: split.categoryId, amount: split.amount })
                .save();

              existingSplits.push(newSplit.id);

              amount = split.amount;
            }

            const category = await Category.findOrFail(split.categoryId, { client: trx });

            category.amount += amount;

            category.save();

            result.balances.push({ id: category.id, balance: category.amount });
          }
        }));

        // Delete splits that are not in the array of ids
        const query = trx
          .from('transaction_categories')
          .whereNotIn('id', existingSplits)
          .andWhere('transaction_id', transactionId);
        const toDelete = await query.select('category_id AS categoryId', 'amount');

        await Promise.all(toDelete.map(async (td) => {
          const category = await Category.findOrFail(td.categoryId, { client: trx });

          category.amount -= td.amount;

          result.balances.push({ id: category.id, balance: category.amount });

          category.save();
        }));

        await query.delete();

        const transaction = await Transaction.findOrFail(transactionId, { client: trx });
        result.transaction.transactionCategories = await transaction.related('transactionCategories').query();
      }

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  public async transferDelete({ request }: HttpContextContract): Promise<void> {
    const trx = await Database.transaction();

    try {
      const { tfrId } = request.params();

      const categoryTransfer = await CategoryTransfer.findOrFail(tfrId, { client: trx });

      const categorySplits = await categoryTransfer.splits(trx);

      await Promise.all(categorySplits.map(async (cs) => {
        const category = await Category.find(cs.categoryId, { client: trx });

        if (category) {
          category.amount -= cs.amount;

          category.save();

          await cs.delete();
        }
      }));

      await categoryTransfer.delete();

      await trx.commit();
    }
    catch (error) {
      console.log(error);
      await trx.rollback();
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

    const { date, id } = request.qs();

    return Category.balances(user.id, date, id);
  }

  // eslint-disable-next-line class-methods-use-this
  public async history({ auth: { user } }: HttpContextContract): Promise<Array<GroupHistoryItem>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    return user.history();
  }
}

export default CategoryController;
export { GroupHistoryItem };
