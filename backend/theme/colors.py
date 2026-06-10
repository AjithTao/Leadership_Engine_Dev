"""
Theme System for WorkBuddy Response Formatting
Supports Light and Dark mode with enterprise-style colors
"""

LIGHT = {
    "PRIMARY_BLUE": "#0A66C2",
    "TEXT_PRIMARY": "#1A1A1A",
    "TEXT_SECONDARY": "#4A4A4A",
    
    "CARD_INFO_BG": "#F3F9FF",
    "CARD_WARNING_BG": "#FFF4D6",
    "CARD_SUCCESS_BG": "#E8F7EE",
    
    "CARD_INFO_BORDER": "#0A66C2",
    "CARD_WARNING_BORDER": "#E09B1A",
    "CARD_SUCCESS_BORDER": "#28A745",
}

DARK = {
    "PRIMARY_BLUE": "#4EA3FF",
    "TEXT_PRIMARY": "#F2F2F2",
    "TEXT_SECONDARY": "#CCCCCC",
    
    "CARD_INFO_BG": "#0F1A26",
    "CARD_WARNING_BG": "#2A1F00",
    "CARD_SUCCESS_BG": "#0D2414",
    
    "CARD_INFO_BORDER": "#4EA3FF",
    "CARD_WARNING_BORDER": "#E8BB4E",
    "CARD_SUCCESS_BORDER": "#3DDC84",
}

def get_theme(theme_name: str):
    """Get theme colors based on theme name"""
    if theme_name == "dark":
        return DARK
    return LIGHT

