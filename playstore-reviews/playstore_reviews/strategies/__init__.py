from playstore_reviews.config import Settings


def build_strategy(settings: Settings):
    if settings.strategy == "library":
        from playstore_reviews.strategies.library import LibraryStrategy

        return LibraryStrategy(settings)
    if settings.strategy == "batchexecute":
        from playstore_reviews.strategies.batchexecute import BatchexecuteStrategy

        return BatchexecuteStrategy(settings)
    return None
