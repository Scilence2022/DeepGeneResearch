import { GeneResearchParameters } from '@/models/task';
import { Md5 } from 'ts-md5';

// 内存缓存存储
const cacheStorage: Map<string, CacheItem> = new Map();

// 缓存项接口
interface CacheItem {
  key: string;
  result: any;
  createdAt: Date;
  expiresAt: Date;
}

// 生成缓存键
export function generateCacheKey(parameters: GeneResearchParameters): string {
  // 移除可能变化但不影响结果的参数
  const { returnReportAsUrl: _returnReportAsUrl, returnDetailsAsUrl: _returnDetailsAsUrl, ...cacheableParams } = parameters;
  // 排序对象键以确保一致的哈希
  const sortedParams = Object.fromEntries(
    Object.entries(cacheableParams).sort(([a], [b]) => a.localeCompare(b))
  );
  // 生成 MD5 哈希
  return Md5.hashStr(JSON.stringify(sortedParams)) as string;
}

// 缓存服务
class CacheService {
  // 默认缓存过期时间（7天）
  private defaultExpiration = 7 * 24 * 60 * 60 * 1000;

  // 检查缓存是否存在
  async getCachedResult(parameters: GeneResearchParameters): Promise<any | null> {
    try {
      const key = generateCacheKey(parameters);
      const cacheItem = cacheStorage.get(key);
      
      if (!cacheItem) {
        return null;
      }

      // 检查是否过期
      const now = new Date();
      if (now > cacheItem.expiresAt) {
        // 过期，删除缓存
        await this.deleteCachedResult(parameters);
        return null;
      }

      return cacheItem.result;
    } catch (error) {
      console.error('Error getting cached result:', error);
      return null;
    }
  }

  // 存储缓存结果
  async setCachedResult(parameters: GeneResearchParameters, result: any): Promise<void> {
    try {
      const key = generateCacheKey(parameters);
      const now = new Date();
      const cacheItem: CacheItem = {
        key,
        result,
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.defaultExpiration),
      };
      cacheStorage.set(key, cacheItem);
    } catch (error) {
      console.error('Error setting cached result:', error);
    }
  }

  // 删除缓存结果
  async deleteCachedResult(parameters: GeneResearchParameters): Promise<boolean> {
    try {
      const key = generateCacheKey(parameters);
      cacheStorage.delete(key);
      return true;
    } catch (error) {
      console.error('Error deleting cached result:', error);
      return false;
    }
  }

  // 清除所有缓存
  async clearAllCache(): Promise<boolean> {
    try {
      cacheStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  // 获取缓存统计信息
  async getCacheStats(): Promise<{
    totalItems: number;
    expiredItems: number;
    size: number;
  }> {
    try {
      let expiredItems = 0;
      const now = new Date();
      
      cacheStorage.forEach(cacheItem => {
        if (now > cacheItem.expiresAt) {
          expiredItems++;
        }
      });
      
      return {
        totalItems: cacheStorage.size,
        expiredItems,
        size: cacheStorage.size, // 简化计算，实际应该计算存储大小
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalItems: 0,
        expiredItems: 0,
        size: 0,
      };
    }
  }
}

// 导出单例实例
export const cacheService = new CacheService();
