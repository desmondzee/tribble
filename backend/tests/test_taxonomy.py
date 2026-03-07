from tribble.models.taxonomy import TaxonomyTerm, CrisisCategory


def test_term_creation():
    t = TaxonomyTerm(
        id="violence_active_threat",
        label="Violence / Active Threat",
        category=CrisisCategory.SECURITY,
        description="Armed conflict or direct threat",
    )
    assert t.category == CrisisCategory.SECURITY


def test_hierarchy():
    t = TaxonomyTerm(
        id="airstrike",
        label="Airstrike",
        category=CrisisCategory.SECURITY,
        description="Aerial bombardment",
        parent_id="violence_active_threat",
    )
    assert t.parent_id == "violence_active_threat"
