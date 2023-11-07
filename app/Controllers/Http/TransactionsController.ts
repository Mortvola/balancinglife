// import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import Category from 'App/Models/Category';
import Transaction from 'App/Models/Transaction';
import TransactionCategory from 'App/Models/TransactionCategory';
import Loan from 'App/Models/Loan';
import LoanTransaction from 'App/Models/LoanTransaction';
import AccountTransaction from 'App/Models/AccountTransaction';
import {
  AccountBalanceProps, CategoryBalanceProps, TransactionProps, TransactionsResponse, TransactionType,
} from 'Common/ResponseTypes';
import Account from 'App/Models/Account';
import { schema, rules } from '@ioc:Adonis/Core/Validator';
import transactionFields from './transactionFields';

export default class TransactionsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
  }: HttpContextContract): Promise<Transaction> {
    const { trxId } = request.params();

    const transaction = await Transaction.query()
      .where('id', trxId)
      .andWhere('deleted', false)
      .firstOrFail();

    await transaction.load('accountTransaction');

    return transaction;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getMultiple({
    request,
  }: HttpContextContract): Promise<TransactionsResponse> {
    let { t } = request.qs();

    if (!Array.isArray(t)) {
      t = [t];
    }

    const transactions = await Transaction.query()
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .whereIn('id', t)
      .andWhere('deleted', false);

    return {
      transactions: transactions.map((transaction) => (
        transaction.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async update({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<Record<string, unknown>> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { trxId } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string.optional([rules.trim()]),
        amount: schema.number.optional(),
        principle: schema.number.optional(),
        date: schema.date.optional(),
        comment: schema.string.optional([rules.trim()]),
        splits: schema.array().members(
          schema.object().members({
            categoryId: schema.number(),
            amount: schema.number(),
            comment: schema.string.optional([rules.trim()]),
          }),
        ),
      }),
    });

    const trx = await Database.transaction();

    try {
      type Result = {
        categories: CategoryBalanceProps[],
        transaction?: Record<string, unknown>,
        acctBalances: AccountBalanceProps[],
      };

      const result: Result = {
        categories: [],
        acctBalances: [],
      };

      if (requestData.date !== undefined
        || requestData.comment !== undefined) {
        const transaction = await Transaction.findOrFail(trxId, { client: trx });

        transaction.merge({
          date: requestData.date,
          comment: requestData.comment,
        });

        await transaction.save();
      }

      // Get the 'unassigned' category id
      const unassigned = await budget.getUnassignedCategory({ client: trx });

      const acctTrans = await AccountTransaction.findByOrFail('transactionId', trxId, { client: trx });

      const account = await Account.findOrFail(acctTrans.accountId);

      const splits = await TransactionCategory.query({ client: trx })
        .preload('loanTransaction')
        .where('transactionId', trxId);

      if (splits.length > 0) {
        // There are pre-existing category splits.
        // Credit the category balance for each one.
        // eslint-disable-next-line no-restricted-syntax
        for (const split of splits) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(split.categoryId, { client: trx });

          category.amount -= split.amount;

          // eslint-disable-next-line no-await-in-loop
          await category.save();

          result.categories.push({ id: category.id, balance: category.amount });
        }

        // Delete any loan transactions that are associated with the categories being deleted.
        // eslint-disable-next-line no-restricted-syntax
        for (const split of splits) {
          if (split.loanTransaction) {
            split.loanTransaction.delete();
            // eslint-disable-next-line no-await-in-loop
            const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });
            // eslint-disable-next-line no-await-in-loop
            await loan.updateBalance();
          }

          split.delete();
        }
      }
      else if (account.tracking === 'Transactions') {
        // There are no category splits. Debit the 'Unassigned' category
        if (requestData.amount !== undefined) {
          unassigned.amount -= acctTrans.amount;
          await unassigned.save();
        }

        result.categories.push({ id: unassigned.id, balance: unassigned.amount });
      }

      const requestedSplits = requestData.splits;

      if (requestedSplits.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const split of requestedSplits) {
          const txCategory = (new TransactionCategory()).useTransaction(trx);

          txCategory.fill({
            categoryId: split.categoryId,
            amount: split.amount,
            comment: split.comment,
            transactionId: trxId,
          });

          txCategory.save();

          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(split.categoryId, { client: trx });

          category.amount += split.amount;

          // eslint-disable-next-line no-await-in-loop
          await category.save();

          if (category.type === 'LOAN') {
            const loanTrx = (new LoanTransaction()).useTransaction(trx);

            // eslint-disable-next-line no-await-in-loop
            const loan = await Loan.findByOrFail('categoryId', split.categoryId, { client: trx });

            loanTrx.fill({
              loanId: loan.id,
              principle: 0,
            });

            // eslint-disable-next-line no-await-in-loop
            await loanTrx.related('transactionCategory').associate(txCategory);
            // eslint-disable-next-line no-await-in-loop
            await loan.updateBalance();
          }

          // Determine if the category is already in the array.
          const index = result.categories.findIndex((c) => c.id === category.id);

          // If the category is already in the array then simply update the amount.
          // Otherwise, add the category and amount to the array.
          if (index !== -1) {
            result.categories[index].balance = category.amount;
          }
          else {
            result.categories.push({ id: category.id, balance: category.amount });
          }
        }
      }
      else if (account.tracking === 'Transactions') {
        // There are no category splits. Debit the 'Unassigned' category
        if (requestData.amount !== undefined) {
          unassigned.amount += requestData.amount;
          await unassigned.save();
        }

        const index = result.categories.findIndex((c) => c.id === unassigned.id);

        if (index !== -1) {
          result.categories[index].balance = unassigned.amount;
        }
        else {
          result.categories.push({ id: unassigned.id, balance: unassigned.amount });
        }
      }

      if (requestData.name !== undefined
        || requestData.amount !== undefined
        || requestData.principle !== undefined) {
        if (account.type === 'loan') {
          account.balance -= acctTrans.principle ?? 0;
        }
        else {
          account.balance -= acctTrans.amount;
        }

        acctTrans.merge({
          name: requestData.name,
          amount: requestData.amount,
          principle: requestData.principle,
        });

        await acctTrans.save();

        if (account.type === 'loan') {
          account.balance += acctTrans.principle ?? 0;
        }
        else {
          account.balance += acctTrans.amount;
        }

        await account.save();
      }

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      await transaction.load('transactionCategories');

      await transaction.load('accountTransaction', (accountTrx) => {
        accountTrx.preload('account', (acct) => {
          acct.preload('institution');
        });
      });

      result.transaction = transaction.serialize(transactionFields)

      result.acctBalances = [{
        id: account.id,
        balance: account.balance,
      }];

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
  public async dedup({
    request,
  }: HttpContextContract): Promise<void> {
    const { trxId } = request.params();

    const transaction = await Transaction.query()
      .where('id', trxId)
      .andWhere('deleted', false)
      .firstOrFail();

    transaction.duplicateOfTransactionId = null;

    await transaction.save();
  }

  // eslint-disable-next-line class-methods-use-this
  public async delete({
    request,
    auth: {
      user,
    },
    logger,
  }: HttpContextContract): Promise<{ categories: CategoryBalanceProps[] }> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const trx = await Database.transaction();

    try {
      const result: {
        categories: CategoryBalanceProps[],
        acctBalances: AccountBalanceProps[],
      } = { categories: [], acctBalances: [] };

      const { trxId } = request.params();

      const transaction = await Transaction.findOrFail(trxId, { client: trx });

      const acctTransaction = await AccountTransaction.findBy('transactionId', transaction.id, { client: trx });

      let account: Account | null = null;

      if (acctTransaction) {
        account = await Account.findOrFail(acctTransaction.accountId, { client: trx });
      }

      const trxCategories = await transaction.related('transactionCategories').query();

      if (trxCategories.length === 0) {
        if (account && account.tracking === 'Transactions') {
          if (!acctTransaction) {
            throw new Error('acctTransaction is null');
          }

          const unassignedCat = await budget.getUnassignedCategory({ client: trx });

          unassignedCat.amount -= acctTransaction.amount;

          result.categories.push({ id: unassignedCat.id, balance: unassignedCat.amount });

          await unassignedCat.save();
        }
      }
      else {
        // eslint-disable-next-line no-restricted-syntax
        for (const trxCat of trxCategories) {
          // eslint-disable-next-line no-await-in-loop
          const category = await Category.findOrFail(trxCat.categoryId, { client: trx });

          category.amount -= trxCat.amount;

          const balance = result.categories.find((b) => b.id === category.id);

          if (balance) {
            balance.balance = category.amount;
          }
          else {
            result.categories.push({ id: category.id, balance: category.amount });
          }

          if (category.type === 'LOAN') {
            // eslint-disable-next-line no-await-in-loop
            const loanTransaction = await trxCat.related('loanTransaction').query().firstOrFail();

            // eslint-disable-next-line no-await-in-loop
            await loanTransaction.delete();

            // eslint-disable-next-line no-await-in-loop
            const loan = await loanTransaction.related('loan').query().firstOrFail();

            loan.updateBalance();
          }

          category.save();

          // eslint-disable-next-line no-await-in-loop
          await trxCat.delete();
        }
      }

      if (account) {
        if (!acctTransaction) {
          throw new Error('acctTransaction is null');
        }

        if (account.type === 'loan') {
          account.balance -= acctTransaction.principle ?? 0;
        }
        else {
          account.balance -= acctTransaction.amount;
        }

        account.save();

        result.acctBalances.push({ id: account.id, balance: account.balance });
      }

      transaction.deleted = true;

      await transaction.save();

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
  public async getRebalances({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const rebalances = await budget.related('transactions').query()
      .preload('transactionCategories')
      .where('type', TransactionType.REBALANCE_TRANSACTION)
      .orderBy('date', 'desc');

    return {
      transactions: rebalances.map((r) => (
        r.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async search({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<TransactionsResponse> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const results = await budget.related('transactions').query()
      .where('deleted', false)
      .whereHas('accountTransaction', (q) => {
        q.whereLike('name', `%${request.qs().name}%`)
      })
      .preload('accountTransaction', (accountTransaction) => {
        accountTransaction.preload('account', (account) => {
          account.preload('institution');
        });
      })
      .preload('transactionCategories', (transactionCategory) => {
        transactionCategory.preload('loanTransaction');
      })
      .orderBy('date', 'desc')

    return ({
      transactions: results.map((t) => (
        t.serialize(transactionFields) as TransactionProps
      )),
      balance: 0,
    })
  }
}
