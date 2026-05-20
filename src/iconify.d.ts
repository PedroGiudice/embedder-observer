// Type augmentation for @iconify-icon/solid web component in SolidJS JSX
import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': {
        icon: string
        width?: number | string
        height?: number | string
        class?: string
        style?: string
        rotate?: number | string
        flip?: string
        inline?: boolean
        ref?: HTMLElement | ((el: HTMLElement) => void)
      }
    }
  }
}
