/**
 * Task List Coordinator
 *
 * In-memory task tracking for team execution.
 * Handles dependency-aware scheduling: tasks unblock when dependencies complete.
 */

import { randomUUID } from 'crypto';

export interface TeamTask {
  id: string;
  role: string;
  depends_on: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: string;
  output?: string;
  error?: string;
}

export class TaskList {
  private tasks = new Map<string, TeamTask>();

  addTask(role: string, input: string, depends_on: string[] = []): string {
    const id = randomUUID().slice(0, 8);
    this.tasks.set(id, {
      id,
      role,
      depends_on,
      status: 'pending',
      input,
    });
    return id;
  }

  /** Return first unblocked pending task for the given role. */
  claimNext(role: string): TeamTask | null {
    for (const task of this.tasks.values()) {
      if (task.role !== role || task.status !== 'pending') continue;

      // Check all dependencies are completed
      const blocked = task.depends_on.some(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status !== 'completed';
      });

      if (!blocked) {
        task.status = 'running';
        return task;
      }
    }
    return null;
  }

  complete(id: string, output: string): void {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    task.status = 'completed';
    task.output = output;
  }

  fail(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    task.status = 'failed';
    task.error = error;
  }

  isComplete(): boolean {
    return Array.from(this.tasks.values()).every(
      t => t.status === 'completed' || t.status === 'failed',
    );
  }

  getResults(): Map<string, string> {
    const results = new Map<string, string>();
    for (const task of this.tasks.values()) {
      if (task.status === 'completed' && task.output) {
        results.set(task.role, task.output);
      }
    }
    return results;
  }

  getAllTasks(): TeamTask[] {
    return Array.from(this.tasks.values());
  }
}
