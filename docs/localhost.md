# Local Rankings on Windows

Open http://localhost:3000/cbb/player-projections.

Install automatic startup once from the project directory:

```powershell
npm run localhost:install
```

This registers the current user's `Bracketball Localhost 3000` task. It starts
at Windows sign-in and runs hidden with normal user permissions. No password is
stored. A repeating trigger checks every minute that the monitor is running.
The monitor restarts Next after an exit, and after three consecutive failed page
checks following an initial three-minute compilation grace period. It leaves an
existing server on port 3000 alone and waits to take over when that server exits.
The managed server binds to 127.0.0.1, so it is available only on this computer.

```powershell
npm run localhost:status
npm run localhost:stop
npm run localhost:start
npm run localhost:uninstall
```

Stop disables the task's automatic triggers as well as stopping the monitor.
Use it before manually running another server or maintaining dependencies.
Start re-enables automatic operation. Uninstall removes only the scheduled task.

Recovery timestamps and exit codes are in `.localhost/supervisor.log`. Next's
output is in `.localhost/next.out.log` and `.localhost/next.err.log`; each restart
retains the previous run with a `.previous` suffix. These files are ignored by Git.

The computer must be on and the Windows user signed in. The page is unavailable
while Windows is asleep or shut down; the task resumes or starts after waking or
signing in. A relocated checkout or Node installation requires re-running install.
This keeps the development server available locally; it does not publish a site.
