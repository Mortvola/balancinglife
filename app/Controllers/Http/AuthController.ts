import jwt from 'jsonwebtoken';
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema, rules } from '@ioc:Adonis/Core/Validator';
import Env from '@ioc:Adonis/Core/Env';
import Logger from '@ioc:Adonis/Core/Logger';
import Mail from '@ioc:Adonis/Addons/Mail';
import User from 'App/Models/User';
import Database from '@ioc:Adonis/Lucid/Database';
import Application from 'App/Models/Application';
import { sha256 } from 'js-sha256';

export default class AuthController {
  // eslint-disable-next-line class-methods-use-this
  public async register({ request, response }: HttpContextContract) : Promise<string> {
    /**
     * Validate user details
     */
    const validationSchema = schema.create({
      username: schema.string([
        rules.trim(),
        rules.unique({ table: 'users', column: 'username' }),
      ]),
      email: schema.string([
        rules.trim(),
        rules.normalizeEmail({ allLowercase: true }),
        rules.unique({ table: 'users', column: 'email' }),
      ]),
      password: schema.string([
        rules.trim(),
        rules.confirmed(),
      ]),
    });

    const userDetails = await request.validate({
      schema: validationSchema,
      messages: {
        'username.unique': 'An account with the requested username already exists',
        'username.required': 'A username is required',
        'email.email': 'A valid email address must be specified',
        'email.required': 'An email address is required',
        'email.unique': 'An account with the requested email address already exists',
        'password.required': 'A password is required',
        'password_confirmation.confirmed': 'The password confirmation does not match the password',
      },
    });

    const trx = await Database.transaction();

    const application = await (new Application())
      .useTransaction(trx)
      .save();

    await application.initialize();

    /**
     * Create a new user
     */
    const user = await (new User())
      .useTransaction(trx)
      .fill({
        username: userDetails.username,
        email: userDetails.email,
        password: userDetails.password,
        applicationId: application.id,
      })
      .save();

    await trx.commit();

    Mail.send((message) => {
      message
        .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
        .to(user.email)
        .subject('Welcome to SpendCraft!')
        .htmlView('emails/welcome', {
          url: user.getEmailVerificationLink(),
          expires: Env.get('TOKEN_EXPIRATION'),
        });
    });

    response.header('Content-type', 'application/json');

    return JSON.stringify('Your account has been created');
  }

  // eslint-disable-next-line class-methods-use-this
  public async verifyEmail({ params, view }: HttpContextContract) : Promise<(string | void)> {
    const user = await User.find(params.id);

    if (user) {
      const payload = jwt.verify(params.token, user.generateSecret()) as Record<string, unknown>;

      if (payload.id === user.id) {
        if (!user.activated) {
          user.activated = true;
          user.save();

          return view.render('emailVerified');
        }

        if (user.pendingEmail) {
          // todo: if the matches fail, send the user to a failure page.
          if (payload.hash === sha256(user.pendingEmail)) {
            user.email = user.pendingEmail;
            user.pendingEmail = null;

            await user.save();

            return view.render('emailVerified');
          }
        }
      }

      Logger.error(`Invalid payload "${payload.id}" in token for user ${user.username}`);
    }

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async login({ auth, request, response }: HttpContextContract) : Promise<void> {
    const validationSchema = schema.create({
      username: schema.string([rules.trim()]),
      password: schema.string([rules.trim()]),
      remember: schema.string.optional([rules.trim()]),
    });

    const credentials = await request.validate({
      schema: validationSchema,
      messages: {
        'username.required': 'A username is required',
        'password.required': 'A password is required',
      },
    });

    response.header('content-type', 'application/json');

    let responseData: unknown = JSON.stringify('/');

    try {
      await auth.attempt(credentials.username, credentials.password, credentials.remember === 'on');
    }
    catch (error) {
      if (error.code === 'E_INVALID_AUTH_UID' || error.code === 'E_INVALID_AUTH_PASSWORD') {
        response.status(422);
        responseData = {
          errors: [
            { field: 'username', message: 'The username or password does not match our records.' },
            { field: 'password', message: 'The username or password does not match our records.' },
          ],
        };
      }
      else {
        throw (error);
      }
    }

    response.send(responseData);
  }

  // eslint-disable-next-line class-methods-use-this
  public async logout({ auth }: HttpContextContract) : Promise<void> {
    auth.logout();
  }

  // eslint-disable-next-line class-methods-use-this
  public async forgotPassword({ request, response }: HttpContextContract) : Promise<void> {
    const validationSchema = schema.create({
      email: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const user = await User.findBy('email', requestData.email);

    if (user) {
      Mail.send((message) => {
        message
          .from(Env.get('MAIL_FROM_ADDRESS') as string, Env.get('MAIL_FROM_NAME') as string)
          .to(user.email)
          .subject('Reset Password Notification')
          .htmlView('emails/reset-password', {
            url: user.getPasswordResetLink(),
            expires: Env.get('TOKEN_EXPIRATION'),
          });
      });

      response.header('content-type', 'application/json');
      response.send(JSON.stringify('We have e-mailed your password reset link!'));
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async resetPassword({ params, view }: HttpContextContract) : Promise<(string | void)> {
    const user = await User.find(params.id);

    if (user) {
      const payload = jwt.verify(params.token, user.generateSecret()) as Record<string, unknown>;

      if (payload.id === parseInt(params.id, 10)) {
        return view.render('reset-password', { user, token: params.token });
      }

      Logger.error(`Invalid payload "${payload.id}" in token for user ${user.username}`);
    }

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async updatePassword({
    request,
    response,
    view,
  }: HttpContextContract) : Promise<(string | void)> {
    const validationSchema = schema.create({
      email: schema.string(),
      password: schema.string(),
      passwordConfirmation: schema.string(),
      token: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const user = await User.findBy('email', requestData.email);

    if (!user) {
      return view.render(
        'reset-password',
        { user, token: requestData.token, errorMessage: 'The user could not be found.' },
      );
    }

    if (requestData.password !== requestData.passwordConfirmation) {
      return view.render(
        'reset-password',
        { user, token: requestData.token, errorMessage: 'The passwords do not match.' },
      );
    }

    let payload: Record<string, unknown> = { id: null };

    try {
      payload = jwt.verify(requestData.token, user.generateSecret()) as Record<string, unknown>;
    }
    catch (error) {
      Logger.error(error);
    }

    if (payload.id !== user.id) {
      return view.render(
        'reset-password',
        { user, token: requestData.token, errorMessage: 'The token is no longer valid.' },
      );
    }

    user.password = requestData.password;
    await user.save();

    response.redirect('/');

    return undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  public async changePassword({
    auth,
    request,
    response,
  }: HttpContextContract) : Promise<(string | void)> {
    const validationSchema = schema.create({
      currentPassword: schema.string(),
      password: schema.string(),
      passwordConfirmation: schema.string(),
    })

    const requestData = await request.validate({
      schema: validationSchema,
    });

    let { user } = auth;

    response.header('content-type', 'application/json');

    if (!user) {
      response.unauthorized({ errors: { currentPassword: 'User is unauthorized' } });
      return undefined;
    }

    try {
      user = await auth.verifyCredentials(user.username, requestData.currentPassword);
    }
    catch {
      response.notAcceptable(JSON.stringify({ errors: { currentPassword: 'Password is not valid' } }));
      return undefined;
    }

    if (!requestData.password || requestData.password !== requestData.passwordConfirmation) {
      response.notAcceptable(
        JSON.stringify({ errors: { passwordConfirmation: 'New password and confirmation do not match' } }),
      );
      return undefined;
    }

    user.password = requestData.password;
    await user.save();

    return undefined;
  }
}
