import chance from 'chance';
import { client } from './client';

export function useUser() {
  const userLimited = {
    id: chance().guid(),
    email: chance().email(),
    name: chance().name(),
    username: chance().first().toLowerCase(),
  };

  client.scenario.get('/v2/user', (_req, res) => {
    res.json({
      user: userLimited,
    });
  });

  client.scenario.post('/registration', (_req, res) => {
    res.json({
      token: 'T1dmvPu36nmyYisXAs7IRzcR',
      securityCode: 'Practical Saola',
    });
  });

  client.scenario.get('/registration/verify', (_req, res) => {
    res.json({
      token: 'hjkjn',
      email: userLimited.email,
    });
  });

  return {
    ...userLimited,
  };
}
