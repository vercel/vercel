import React, { useContext, useEffect, useState, useMemo } from 'react';
import { AppContext } from './AppContext';
import { DispatchObject } from '../util/types';
import { AppState } from './state';

interface ConnectParams<TOwnProps, TStateProps, TDispatchProps> {
  mapStateToProps?: (state: AppState, props: TOwnProps) => TStateProps,
  mapDispatchToProps?: TDispatchProps,
  component: React.ComponentType<any>
};

export function connect<TOwnProps = any, TStateProps = any, TDispatchProps = any>({ mapStateToProps = () => ({} as TStateProps), mapDispatchToProps = {} as TDispatchProps, component }: ConnectParams<TOwnProps, TStateProps, TDispatchProps>): React.FunctionComponent<TOwnProps> {

  const Connect = (ownProps: TOwnProps) => {
    const context = useContext(AppContext);

    const dispatchFuncs = useMemo(() => {
      const dispatchFuncs: { [key: string]: any } = {};
      Object.keys(mapDispatchToProps).forEach((key) => {
        const oldFunc = (mapDispatchToProps as any)[key];
        const newFunc = (...args: any) => {
          const dispatchFunc = oldFunc(...args);
          if (typeof dispatchFunc === 'object') {
            context.dispatch(dispatchFunc);
          } else {
            const result = dispatchFunc(context.dispatch)
            if (typeof result === 'object' && result.then) {
              result.then((dispatchObject?: DispatchObject) => {
                if (dispatchObject && dispatchObject.type) {
                  context.dispatch(dispatchObject);
                }
              })
            }
          }
        }
        dispatchFuncs[key] = newFunc
      });
      return dispatchFuncs;
    }, [mapDispatchToProps])


    const props = useMemo(() => {
      return Object.assign({}, ownProps, mapStateToProps(context.state, ownProps), dispatchFuncs);
    }, [ownProps, context.state]);

    return React.createElement<TOwnProps>(component, props);
  }
  return React.memo(Connect as any);
}
