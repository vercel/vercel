import * as Components from './components';
declare type MetaComponents = typeof Components;
declare module 'vue' {
    interface GlobalComponents extends MetaComponents {
    }
}
declare const _default: any;
export default _default;
