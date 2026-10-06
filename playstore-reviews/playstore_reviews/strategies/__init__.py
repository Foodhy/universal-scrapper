from playstore_reviews.config import NAMED_STRATEGIES, Settings


def build_strategy(settings: Settings, name: str):
    """Una estrategia nueva se registra aquí y en NAMED_STRATEGIES."""
    if name not in NAMED_STRATEGIES:
        raise ValueError(f"Estrategia desconocida: {name}")
    if name == "library":
        from playstore_reviews.strategies.library import LibraryStrategy

        return LibraryStrategy(settings)
    from playstore_reviews.strategies.batchexecute import BatchexecuteStrategy

    return BatchexecuteStrategy(settings)
