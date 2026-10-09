import * as marks from '@docs/components/mcp/brand-marks'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/landing.css'
import '@docs/styles/v2.css'
const meta = {
  title: 'Marketing/MCP / Brand Marks/ClaudeMark',
  component: marks.ClaudeMark,
  args: { className: 'size-10' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof marks.ClaudeMark>
export default meta
export const Default: StoryObj<typeof meta> = {}
export const AllMarks: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid grid-cols-5 gap-6">
      {Object.entries(marks).map(([name, Mark]) => (
        <div key={name} className="flex flex-col items-center gap-2 text-xs">
          <Mark className="size-10" />
          {name}
        </div>
      ))}
    </div>
  ),
}
