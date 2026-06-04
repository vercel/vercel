module.exports = {
  experimental: { tasks: true },
  scheduledTasks: {
    '* * * * *': ['db:cleanup'],
    '*/2 * * * *': ['cms:update'],
  },
};
