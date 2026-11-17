import { execFileSync } from 'node:child_process';

// Publishing has already built and verified the output in prepublishOnly.
if (process.env.npm_command !== 'publish')
{
	execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
}
