class RAGStore:
    def __init__(self):
        self.context_cache = ""
        
    def update_context(self, context_str: str):
        self.context_cache = context_str
        
    def get_context(self) -> str:
        return self.context_cache
