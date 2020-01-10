export function combineReducers<R extends any>(reducers: R) {
  type keys = keyof typeof reducers;
  type returnType = { [K in keys]: ReturnType<typeof reducers[K]> };
  const combinedReducer = (state: any, action: any) => {
    const newState: returnType = {} as any;
    const keys = Object.keys(reducers);
    keys.forEach(key => {
      const result = reducers[key](state[key], action);
      newState[key as keys] = result || state[key];
    });
    return newState;
  };
  return combinedReducer;
}
