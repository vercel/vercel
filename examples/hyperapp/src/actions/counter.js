const actions = {
    add: () => state => ({ num: state.num + 1, clicks: state.clicks + 1 }),
    sub: () => state => ({ num: state.num - 1, clicks: state.clicks + 1 }),
};

export default actions;
