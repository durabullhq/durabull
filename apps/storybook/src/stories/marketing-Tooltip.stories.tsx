import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@docs/components/ui/tooltip'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/Ui / Tooltip/Tooltip',
  component: Tooltip,
  args: { children: null },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <button type="button">Hover for context</button>
        </TooltipTrigger>
        <TooltipContent>Inspect queue health</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
} satisfies Meta<typeof Tooltip>
export default meta
export const Default: StoryObj<typeof meta> = {}
