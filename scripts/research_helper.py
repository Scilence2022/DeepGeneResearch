#!/usr/bin/env python3
"""
DeepGeneResearch Python Helper
Easy interface for AI assistant to call gene research

Usage:
    python3 research_helper.py lysC "Escherichia coli"
    python3 research_helper.py lysC "Escherichia coli" Chinese
    python3 research_helper.py --status
    python3 research_helper.py --list
"""

import requests
import json
import sys
import time
from typing import Optional, Dict, Any

SERVER_URL = "http://localhost:3000"
GENE_ENDPOINT = f"{SERVER_URL}/api/research/gene"

class DeepGeneResearchHelper:
    def __init__(self, server_url: str = SERVER_URL):
        self.server_url = server_url
        
    def research_gene(
        self,
        gene_symbol: str,
        organism: str,
        language: str = "English",
        max_result: int = 5,
        use_cache: bool = True,
        force_refresh: bool = False,
        timeout: int = 600
    ) -> Dict[str, Any]:
        """
        Run gene research and return results
        
        Args:
            gene_symbol: Gene name (e.g., 'lysC', 'BRCA1')
            organism: Organism name (e.g., 'Escherichia coli', 'Homo sapiens')
            language: Report language (English/Chinese)
            max_result: Max search results per query
            use_cache: Use cached results if available
            force_refresh: Force fresh research even if cached
            timeout: Request timeout in seconds
            
        Returns:
            Dict with research results
        """
        payload = {
            "geneSymbol": gene_symbol,
            "organism": organism,
            "language": language,
            "maxResult": max_result,
            "enableCitationImage": True,
            "enableReferences": True,
            "useCache": use_cache,
            "forceRefresh": force_refresh
        }
        
        print(f"[Research] Starting: {gene_symbol} in {organism}")
        print(f"[Research] Language: {language}, MaxResults: {max_result}")
        
        start_time = time.time()
        
        try:
            response = requests.post(
                GENE_ENDPOINT,
                json=payload,
                timeout=timeout,
                headers={"Content-Type": "application/json"}
            )
            
            elapsed = time.time() - start_time
            
            if response.status_code == 200:
                result = response.json()
                source = result.get('source', 'unknown')
                
                if result.get('success'):
                    print(f"[Research] ✓ Completed in {elapsed:.1f}s (source: {source})")
                    
                    # Print summary
                    if 'data' in result:
                        data = result['data']
                        if 'title' in data:
                            print(f"[Research] Title: {data['title']}")
                        if 'qualityMetrics' in data:
                            qm = data['qualityMetrics']
                            print(f"[Research] Quality: {qm.get('overallQuality', 0) * 100:.0f}%")
                    
                    return result
                else:
                    print(f"[Research] ✗ Failed: {result.get('message', 'Unknown error')}")
                    return result
            else:
                print(f"[Research] ✗ HTTP {response.status_code}: {response.text}")
                return {"success": False, "error": f"HTTP {response.status_code}"}
                
        except requests.exceptions.Timeout:
            print(f"[Research] ✗ Timeout after {timeout}s")
            return {"success": False, "error": "Timeout"}
        except requests.exceptions.ConnectionError:
            print(f"[Research] ✗ Cannot connect to {self.server_url}")
            print(f"[Research] Make sure DeepGeneResearch server is running on port 3000")
            return {"success": False, "error": "Connection failed"}
        except Exception as e:
            print(f"[Research] ✗ Error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def get_cache_status(self, gene_symbol: str = None, organism: str = None) -> Dict[str, Any]:
        """Check cache status for a gene or list all cached genes"""
        try:
            params = []
            if gene_symbol:
                params.append(f"gene={requests.utils.quote(gene_symbol)}")
            if organism:
                params.append(f"organism={requests.utils.quote(organism)}")
            
            path = "/api/research/gene"
            if params:
                path += "?" + "&".join(params)
            
            response = requests.get(f"{self.server_url}{path}", timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    
    def list_cached(self) -> list:
        """List all cached gene research results"""
        result = self.get_cache_status()
        if 'cachedGenes' in result:
            return result['cachedGenes']
        return []
    
    def clear_cache(self, gene_symbol: str = None, organism: str = None) -> bool:
        """Clear cache for specific gene or all genes"""
        try:
            params = []
            if gene_symbol:
                params.append(f"gene={requests.utils.quote(gene_symbol)}")
            if organism:
                params.append(f"organism={requests.utils.quote(organism)}")
            
            path = "/api/research/gene"
            if params:
                path += "?" + "&".join(params)
            
            response = requests.delete(f"{self.server_url}{path}", timeout=10)
            return response.status_code == 200 and response.json().get('success', False)
        except Exception as e:
            print(f"Clear failed: {e}")
            return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    helper = DeepGeneResearchHelper()
    
    if sys.argv[1] == "--status":
        if len(sys.argv) >= 3:
            gene = sys.argv[2]
            organism = sys.argv[3] if len(sys.argv) >= 4 else None
            result = helper.get_cache_status(gene, organism)
        else:
            result = helper.get_cache_status()
        
        print("\n--- Cache Status ---")
        if 'cached' in result:
            if result['cached']:
                print(f"Gene: {result.get('geneSymbol')}/{result.get('organism')}")
                print(f"Cached: Yes ({result.get('ageHours')}h old)")
                print(f"Confidence: {result.get('confidence', 0) * 100:.0f}%")
            else:
                print(f"Gene: {result.get('geneSymbol')}/{result.get('organism')}")
                print(f"Cached: No")
        elif 'cachedGenes' in result:
            print(f"Total: {result.get('total', 0)} genes cached")
            for g in result['cachedGenes']:
                print(f"  - {g['geneSymbol']} ({g['organism']}) - {g['confidence'] * 100:.0f}%")
        sys.exit(0)
    
    if sys.argv[1] == "--list":
        print("\n--- Cached Genes ---")
        cached = helper.list_cached()
        print(f"Total: {len(cached)} genes")
        for g in cached:
            print(f"  - {g['geneSymbol']} ({g['organism']}) - {g['confidence'] * 100:.0f}% - {g['updatedAt']}")
        sys.exit(0)
    
    if sys.argv[1] == "--clear":
        gene = sys.argv[2] if len(sys.argv) >= 3 else None
        organism = sys.argv[3] if len(sys.argv) >= 4 else None
        if helper.clear_cache(gene, organism):
            print("Cache cleared successfully")
        else:
            print("Cache clear failed")
        sys.exit(0)
    
    # Default: run research
    gene_symbol = sys.argv[1]
    organism = sys.argv[2] if len(sys.argv) >= 3 else "Escherichia coli"
    language = sys.argv[3] if len(sys.argv) >= 4 else "English"
    
    result = helper.research_gene(gene_symbol, organism, language)
    
    if result.get('success'):
        print("\n--- Research Summary ---")
        print(f"Gene: {result.get('geneSymbol')}")
        print(f"Organism: {result.get('organism')}")
        print(f"Source: {result.get('source')}")
        print(f"Time: {result.get('researchTime', 0)}ms")
        
        if 'data' in result and result['data']:
            data = result['data']
            if 'sections' in data and data['sections']:
                print(f"Sections: {len(data['sections'])}")
    else:
        print(f"\nResearch failed: {result.get('message')}")


if __name__ == "__main__":
    main()
