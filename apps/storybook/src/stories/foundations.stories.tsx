import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const meta = { title: 'Foundations/Primitives' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const Buttons: Story = {
  render: () => (
    <div className="space-y-6">
      {(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map(
        (variant) => (
          <div key={variant} className="catalog-stack">
            {(['xs', 'sm', 'default', 'lg'] as const).map((size) => (
              <Button key={size} variant={variant} size={size}>
                {variant} · {size}
              </Button>
            ))}
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </div>
        )
      )}
    </div>
  ),
}
export const Badges: Story = {
  render: () => (
    <div className="catalog-stack">
      {(['default', 'secondary', 'destructive', 'outline', 'success', 'warning'] as const).map(
        (variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        )
      )}
    </div>
  ),
}
export const FormFields: Story = {
  render: () => (
    <div className="catalog-grid">
      <div className="space-y-3">
        <Label htmlFor="job-name">Job name</Label>
        <Input id="job-name" placeholder="send-receipt" />
        <Label htmlFor="queue">Queue</Label>
        <Select id="queue">
          <option>email:receipts</option>
          <option>image:resize</option>
        </Select>
      </div>
      <div className="space-y-3">
        <Label htmlFor="disabled">Disabled</Label>
        <Input id="disabled" value="Managed by environment" disabled />
        <Label htmlFor="invalid">Invalid value</Label>
        <Input id="invalid" aria-invalid defaultValue="invalid" />
        <p className="text-destructive text-sm">Enter a valid job name.</p>
      </div>
    </div>
  ),
}
export const Cards: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Receipt delivery</CardTitle>
        <CardDescription>Queue health and throughput</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-semibold">84,592</p>
        <p className="text-muted-foreground">Completed jobs</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline">View queue</Button>
      </CardFooter>
    </Card>
  ),
}
function TabsExample() {
  const [tab, setTab] = useState('data')
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="data">Data</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>
      <TabsContent value="data">Job payload</TabsContent>
      <TabsContent value="logs">Worker log output</TabsContent>
    </Tabs>
  )
}
export const NavigationTabs: Story = { render: () => <TabsExample /> }
export const AvatarsAndSkeletons: Story = {
  render: () => (
    <div className="max-w-sm space-y-4">
      <div className="catalog-stack">
        <Avatar>
          <AvatarFallback>AM</AvatarFallback>
        </Avatar>
        <span>Alex Morgan</span>
      </div>
      <Separator />
      <div className="catalog-stack">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  ),
}
export const Tables: Story = {
  render: () => (
    <Table>
      <TableCaption>Demo queue counts</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Queue</TableHead>
          <TableHead>Waiting</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>email:receipts</TableCell>
          <TableCell>128</TableCell>
          <TableCell>
            <Badge variant="success">Active</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>1 queue</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
}
export const Collapse: Story = {
  render: () => (
    <Collapsible className="max-w-md space-y-4">
      <CollapsibleTrigger asChild>
        <Button variant="outline">Show advanced options</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="catalog-panel">
        Retry failed jobs with exponential backoff.
      </CollapsibleContent>
    </Collapsible>
  ),
}
export const Modal: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Redis connection</DialogTitle>
          <DialogDescription>Explore dialog focus and keyboard behavior.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Connection name" placeholder="Production" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save demo</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
export const Drawer: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Queue details</SheetTitle>
          <SheetDescription>Inspect work without leaving the list.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
}
function MenuExample() {
  const [checked, setChecked] = useState(true)
  const [environment, setEnvironment] = useState('production')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Queue actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>email:receipts</DropdownMenuLabel>
        <DropdownMenuItem>
          Inspect queue<DropdownMenuShortcut>⌘ I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
          Show completed
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={environment} onValueChange={setEnvironment}>
          <DropdownMenuRadioItem value="production">Production</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="staging">Staging</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Export demo</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
export const Menus: Story = { render: () => <MenuExample /> }
export const Tooltips: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover or focus</Button>
      </TooltipTrigger>
      <TooltipContent>Redis connection is healthy</TooltipContent>
    </Tooltip>
  ),
}
export const Notifications: Story = {
  render: () => (
    <div className="catalog-stack">
      <Button onClick={() => toast.success('Demo job retried')}>Success</Button>
      <Button variant="destructive" onClick={() => toast.error('Demo connection unavailable')}>
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() => toast('Demo queue paused', { description: 'No live queue was changed.' })}
      >
        Information
      </Button>
    </div>
  ),
}
export const Charts: Story = {
  render: () => (
    <ChartContainer
      className="h-80 w-full"
      config={{ completed: { label: 'Completed', color: '#13795b' } }}
    >
      <BarChart
        data={[
          { hour: '09:00', completed: 320 },
          { hour: '10:00', completed: 480 },
          { hour: '11:00', completed: 410 },
        ]}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="completed" fill="var(--color-completed)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
}
export const ColorTokens: Story = {
  render: () => (
    <div className="catalog-grid">
      {[
        'background',
        'foreground',
        'card',
        'primary',
        'secondary',
        'muted',
        'accent',
        'destructive',
        'border',
        'ring',
      ].map((token) => (
        <div key={token} className="catalog-panel">
          <div
            className="h-20 rounded border mb-4"
            style={{ background: `var(--color-${token})` }}
          />
          <code>{token}</code>
        </div>
      ))}
    </div>
  ),
}
