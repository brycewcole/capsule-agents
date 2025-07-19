import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LockIcon } from 'lucide-react'

interface LoginDialogProps {
  open: boolean
  onLogin: (password: string) => void
  error?: string
}

export function LoginDialog({ open, onLogin, error }: LoginDialogProps) {
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    
    setIsLoading(true)
    try {
      await onLogin(password)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[425px]" hideCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <LockIcon className="h-5 w-5" />
            <DialogTitle>Admin Login</DialogTitle>
          </div>
          <DialogDescription>
            Enter the admin password to access the configurator
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value="admin"
              disabled
              className="bg-muted"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
              disabled={isLoading}
            />
          </div>
          
          {error && (
            <div className="text-sm text-destructive">
              {error}
            </div>
          )}
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={!password.trim() || isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}