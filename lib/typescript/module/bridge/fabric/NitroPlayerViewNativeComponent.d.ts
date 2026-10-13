import { type CodegenTypes, type HostComponent, type ViewProps } from 'react-native';
type OnNitroIdChangeEvent = Readonly<{
    nitroId: CodegenTypes.Int32;
}>;
export interface ViewViewNativeProps extends ViewProps {
    nitroId: CodegenTypes.Int32;
    onNitroIdChange?: CodegenTypes.DirectEventHandler<OnNitroIdChangeEvent>;
}
declare const _default: HostComponent<ViewViewNativeProps>;
export default _default;
//# sourceMappingURL=NitroPlayerViewNativeComponent.d.ts.map