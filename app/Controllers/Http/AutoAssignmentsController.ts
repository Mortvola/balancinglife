import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { rules, schema } from '@ioc:Adonis/Core/Validator';
import Database from '@ioc:Adonis/Lucid/Database';
import AutoAssignment from 'App/Models/AutoAssignment';
import AutoAssignmentCategory from 'App/Models/AutoAssignmentCategory';

export default class AutoAssignmentsController {
  // eslint-disable-next-line class-methods-use-this
  public async get({
    request,
  }: HttpContextContract): Promise<AutoAssignment | AutoAssignment[]> {
    const { id } = request.params();

    let assignment: AutoAssignment

    if (id) {
      assignment = await AutoAssignment.query()
        .where('id', id)
        .firstOrFail();

      await assignment.load('categories');
      // await assignment.load('searchStrings');

      return assignment;
    }

    const assignments = await AutoAssignment.query()
      .preload('categories')
      // .preload('searchStrings')

    return assignments;
  }

  // eslint-disable-next-line class-methods-use-this
  public async post({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<AutoAssignment> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string([rules.trim()]),
        searchStrings: schema.array().members(schema.string()),
        categories: schema.array().members(
          schema.object().members({
            id: schema.number(),
            categoryId: schema.number(),
            amount: schema.number(),
            percentage: schema.boolean(),
          }),
        ),
      }),
    });

    const trx = await Database.transaction();

    try {
      const budget = await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const autoAssignment = await budget.related('autoAssignment')
        .create({
          name: requestData.name,
          searchStrings: requestData.searchStrings,
        })

      // eslint-disable-next-line no-restricted-syntax
      for (const category of requestData.categories) {
        // eslint-disable-next-line no-await-in-loop
        await autoAssignment.related('categories').create({
          categoryId: category.categoryId,
          amount: category.amount,
          percentage: category.percentage,
        })
      }

      await autoAssignment.load('categories');

      await trx.commit();

      return autoAssignment;
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async patch({
    request,
    auth: {
      user,
    },
  }: HttpContextContract): Promise<AutoAssignment> {
    if (!user) {
      throw new Error('user is not defined');
    }

    const { id } = request.params();
    const requestData = await request.validate({
      schema: schema.create({
        name: schema.string([rules.trim()]),
        searchStrings: schema.array().members(schema.string()),
        categories: schema.array().members(
          schema.object().members({
            id: schema.number(),
            categoryId: schema.number(),
            amount: schema.number(),
            percentage: schema.boolean(),
          }),
        ),
      }),
    });

    const trx = await Database.transaction();

    try {
      await user.related('budget').query()
        .useTransaction(trx)
        .forUpdate()
        .firstOrFail();

      const autoAssignment = await AutoAssignment.findOrFail(id, { client: trx })

      await autoAssignment.merge({
        name: requestData.name,
        searchStrings: requestData.searchStrings,
      })
        .save();

      // eslint-disable-next-line no-restricted-syntax
      for (const category of requestData.categories) {
        if (category.id >= 0) {
          // eslint-disable-next-line no-await-in-loop
          const autoAssignCategory = await AutoAssignmentCategory.findOrFail(category.id, { client: trx })

          // eslint-disable-next-line no-await-in-loop
          await autoAssignCategory.merge({
            categoryId: category.categoryId,
            amount: category.amount,
            percentage: category.percentage,
          })
            .save()
        }
        else {
          // eslint-disable-next-line no-await-in-loop
          const newAutoAssignCat = await autoAssignment.related('categories').create({
            categoryId: category.categoryId,
            amount: category.amount,
            percentage: category.percentage,
          });

          category.id = newAutoAssignCat.id;
        }
      }

      await autoAssignment.related('categories').query()
        .whereNotIn('id', requestData.categories.map((c) => c.id))
        .delete()

      await autoAssignment.load('categories');

      await trx.commit();

      return autoAssignment;
    }
    catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}
