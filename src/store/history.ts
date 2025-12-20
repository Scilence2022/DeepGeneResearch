import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";
import type { TaskStore } from "./task";
import { researchStore } from "@/utils/storage";
import { customAlphabet } from "nanoid";
import { clone, pick } from "radash";
import { generateTaskId } from "@/utils/task-id-generator";

export interface ResearchHistory extends TaskStore {
  createdAt: number;
  updatedAt?: number;
}

export type ResearchStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface ResearchTask {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ResearchStatus;
  query: string;
  config: {
    language: string;
    enableCitationImage: boolean;
    enableReferences: boolean;
    maxResult: number;
  };
  progress?: {
    step: string;
    status: string;
    data?: any;
  };
  result?: any;
  error?: string;
}

export interface HistoryStore {
  history: ResearchHistory[];
  researchTasks: ResearchTask[];
}

interface HistoryActions {
  // Existing methods for research history
  save: (taskStore: TaskStore) => string;
  load: (id: string) => TaskStore | void;
  update: (id: string, taskStore: TaskStore) => boolean;
  remove: (id: string) => boolean;
  
  // New methods for research task management
  createTask: (task: Omit<ResearchTask, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTaskStatus: (id: string, status: ResearchStatus, data?: any) => boolean;
  getTask: (id: string) => ResearchTask | undefined;
  getAllTasks: () => ResearchTask[];
  deleteTask: (id: string) => boolean;
  updateTaskResult: (id: string, result: any) => boolean;
}

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 12);

export const useHistoryStore = create(
  persist<HistoryStore & HistoryActions>(
    (set, get) => ({
      history: [],
      researchTasks: [],
      
      // Existing methods
      save: (taskStore) => {
        // Only tasks with a title and final report are saved to the history
        if (taskStore.title && taskStore.finalReport) {
          const id = nanoid();
          const newHistory: ResearchHistory = {
            ...clone(taskStore),
            id,
            createdAt: Date.now(),
          };
          set((state) => ({ history: [newHistory, ...state.history] }));
          return id;
        }
        return "";
      },
      load: (id) => {
        const current = get().history.find((item) => item.id === id);
        if (current) return clone(current);
      },
      update: (id, taskStore) => {
        const newHistory = get().history.map((item) => {
          if (item.id === id) {
            return {
              ...clone(taskStore),
              updatedAt: Date.now(),
            } as ResearchHistory;
          } else {
            return item;
          }
        });
        set(() => ({ history: [...newHistory] }));
        return true;
      },
      remove: (id) => {
        set((state) => ({
          history: state.history.filter((item) => item.id !== id),
        }));
        return true;
      },
      
      // New methods for research task management
      createTask: (task) => {
        const id = generateTaskId();
        const timestamp = new Date().toISOString();
        const newTask: ResearchTask = {
          ...task,
          id,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        
        set((state) => ({
          researchTasks: [newTask, ...state.researchTasks]
        }));
        
        return id;
      },
      
      updateTaskStatus: (id, status, data) => {
        const newTasks = get().researchTasks.map((task) => {
          if (task.id === id) {
            const updatedTask: ResearchTask = {
              ...task,
              status,
              updatedAt: new Date().toISOString(),
              progress: data ? {
                step: data.step || task.progress?.step || '',
                status: data.status || 'in-progress',
                data: data.data,
              } : task.progress,
              error: status === 'failed' ? data?.error || '' : undefined,
            };
            return updatedTask;
          }
          return task;
        });
        
        set(() => ({ researchTasks: newTasks }));
        return true;
      },
      
      getTask: (id) => {
        return get().researchTasks.find((task) => task.id === id);
      },
      
      getAllTasks: () => {
        return [...get().researchTasks];
      },
      
      deleteTask: (id) => {
        set((state) => ({
          researchTasks: state.researchTasks.filter((task) => task.id !== id)
        }));
        return true;
      },
      
      updateTaskResult: (id, result) => {
        const newTasks = get().researchTasks.map((task) => {
          if (task.id === id) {
            return {
              ...task,
              result,
              status: 'completed',
              updatedAt: new Date().toISOString(),
            };
          }
          return task;
        });
        
        set(() => ({ researchTasks: newTasks }));
        return true;
      },
    }),
    {
      name: "historyStore",
      version: 2,
      storage: {
        getItem: async (key: string) => {
          return await researchStore.getItem<
            StorageValue<HistoryStore & HistoryActions>
          >(key);
        },
        setItem: async (
          key: string,
          store: StorageValue<HistoryStore & HistoryActions>
        ) => {
          return await researchStore.setItem(key, {
            state: pick(store.state, ["history", "researchTasks"]),
            version: store.version,
          });
        },
        removeItem: async (key: string) => await researchStore.removeItem(key),
      },
    }
  )
);
