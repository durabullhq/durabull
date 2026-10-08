let desktop = false
export function setDesktop(value: boolean) {
  desktop = value
}
export const useIsElectronShell = () => desktop
export const useIsMacElectronShell = () => desktop
