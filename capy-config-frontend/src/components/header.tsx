
import logoSrc from '/src/assets/logo.png';

export default function Header() {
  return (
    <header className="border-b bg-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center px-4 md:px-6 lg:px-8">
        <img src={logoSrc} alt="Logo" className="h-9 w-9" />
        <h1 className="ml-2 text-2xl font-bold tracking-tight">CapyAgents</h1>
        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Beta</span>
        <nav className="ml-auto flex items-center gap-4">
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Docs
          </a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Examples
          </a>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}
