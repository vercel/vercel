import type { ExpressRouter } from 'express';
import type { User } from '@vercel-internals/types';

export type Team = {
  id: string;
  slug: string;
  name: string;
  creatorId: string;
  created: string;
  avatar: null;
};

export type TeamRouteOptions = {
  failMissingToken?: boolean;
  failInvalidToken?: boolean;
  failNoAccess?: boolean;
  failWithCustom403Code?: boolean;
  apiVersion?: number;
};

export function registerUserRoutes(
  router: ExpressRouter,
  user: Pick<User, 'email'>
) {
  router.get('/v2/user', (_req, res) => {
    res.json({
      user,
    });
  });

  router.post('/registration', (_req, res) => {
    res.json({
      token: 'T1dmvPu36nmyYisXAs7IRzcR',
      securityCode: 'Practical Saola',
    });
  });

  router.get('/registration/verify', (_req, res) => {
    res.json({
      token: 'hjkjn',
      email: user.email,
    });
  });
}

export function registerTeamRoutes(
  router: ExpressRouter,
  teams: Team[],
  options: TeamRouteOptions = {
    failMissingToken: false,
    failInvalidToken: false,
    failNoAccess: false,
    failWithCustom403Code: false,
    apiVersion: 1,
  }
) {
  for (const team of teams) {
    router.get(`/teams/${team.id}`, (_req, res) => {
      if (options.failMissingToken) {
        res.statusCode = 403;
        res.json({
          message: 'The request is missing an authentication token',
          code: 'forbidden',
          missingToken: true,
        });
        return;
      }
      if (options.failInvalidToken) {
        res.statusCode = 403;
        res.json({
          message: 'Not authorized',
          code: 'forbidden',
          invalidToken: true,
        });
        return;
      }

      if (options.failNoAccess) {
        res.statusCode = 403;
        res.send({
          code: 'team_unauthorized',
          message: 'You are not authorized',
        });
        return;
      }

      if (options.failWithCustom403Code) {
        res.statusCode = 403;
        res.send({
          code: 'custom_error_code',
          message: 'You are not authorized to read this team.',
        });
        return;
      }

      res.json(team);
    });
  }

  router.get(`/v${options.apiVersion}/teams`, (_req, res) => {
    res.json({
      teams,
    });
  });
}
