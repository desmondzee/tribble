"""Base interface for gazetteer providers."""

from abc import ABC, abstractmethod

from tribble.geolocation.types import CandidateLocation, PlaceMention


class GazetteerProvider(ABC):
    """Abstract base for candidate location providers."""

    @abstractmethod
    def search(self, mention: PlaceMention, context_country: str | None = None) -> list[CandidateLocation]:
        """
        Return candidate locations for a place mention.

        Args:
            mention: Extracted place mention
            context_country: Optional country hint from article context

        Returns:
            List of candidate locations, ordered by relevance
        """
        ...
