import { codegenNativeComponent, type CodegenTypes, type HostComponent, type ViewProps } from 'react-native';

type OnNitroIdChangeEvent = Readonly<{
  nitroId: CodegenTypes.Int32;
}>;

export interface ViewViewNativeProps extends ViewProps {
  nitroId: CodegenTypes.Int32;
  onNitroIdChange?: CodegenTypes.DirectEventHandler<OnNitroIdChangeEvent>;
}

export default codegenNativeComponent<ViewViewNativeProps>('RNCNitroPlayerView') as HostComponent<ViewViewNativeProps>;
