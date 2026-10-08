import { resetDemo } from './demo';

/** Runs once, after the server is up: every run starts from the same demo */
export default async function globalSetup(): Promise<void> {
  await resetDemo();
}
