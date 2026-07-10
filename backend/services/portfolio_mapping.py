"""
Portfolio Mapping Module

Centralized portfolio-to-projects mapping for all TCOE metrics analyzers.
This ensures consistent multi-project JQL support across all metrics.

Author: FalconX Team
Created: 2026-05-05
"""

from typing import Dict, List

# Active QCOE/TCOE reporting scope synced from TAC Bar Chart.csv.
# Source file is UTF-16 LE + tab-delimited and has one row per automation status.
PORTFOLIO_PROJECTS: Dict[str, List[str]] = {
    'Data Platform': [
        'MDSICAP', 'MDSIA', 'OIP', 'MPSMOD', 'MPSUPDATES', 'OEMBD', 'AAP', 'AIVAPL',
        'AIVA', 'ASYNCAPI', 'DNAST', 'DNASYND', 'EDPOEMI', 'MDSEDP', 'MDSMIG', 'TDI',
        'TDO', 'TDOPS', 'TDP', 'TOB', 'TST', 'UDC', 'UDI',
    ],

    'Data Solutions': [
        'NDP', 'SSBYOD', 'DNACS', 'NPS', 'DNADEDGE', 'DNALPS', 'DNADDX', 'APITRON',
        'DET', 'WRP',
    ],

    'DMS': [
        'APMODACC', 'ARMODACC', 'FSMODACC', 'MDWP', 'MODACCRPTS', 'MODBETC', 'MODDWTC', 'MODPLAT',
        'MODSRCH', 'MODTOOL', 'POMODACC', 'BRMODACC', 'ACC', 'FSACC', 'DE', 'DRV',
        'QTCLOUD', 'TRKMOD', 'TRKMISC', 'MODOEM', 'OEMI', 'PSRD',
    ],

    'Fixed Ops': [
        'FIX', 'FIXPRTSMKT', 'FIXPRTSORD', 'FXOPKIT', 'MODPRT', 'MPDS', 'SER', 'CDKSRVAPL',
        'CDKSRVDAT', 'CDKSRVPLT', 'FXDOPSHT', 'FXDPSCN', 'PPR', 'FXDOPSHTT', 'CDKSRVAN', 'CDKSRVFRD',
        'CDKSRVOEM', 'CSFM', 'FPE', 'FXDOPSDLM', 'FXDOPSQMS', 'FXOPSSRE', 'CDKSRVAPT', 'FXDOPSTOY',
        'EUM', 'ADMSE', 'CDKSRVACC', 'FXDOPSAPT', 'FXDOPSINSP', 'ROS', 'CDKSRVLNI', 'PARTSDEV',
        'SVEDRVE', 'ELESRV',
    ],

    'Fortellis': [
        'FORT', 'FORTAPPAPI', 'FORTQA', 'FORTCORE', 'FORTMP',
    ],

    'Inventory Management Solutions': [
        'SM', 'CI', 'EDGEINV', 'ULI', 'CVC', 'MODVHCL',
    ],

    'Modern Retail': [
        'CCEL', 'CRMMYDAY', 'CRMP4S', 'EKC', 'ELCRMHE', 'ELCRMHT', 'ELDBD', 'ELEMRS',
        'ELMOB', 'ELQAA', 'ELRPT', 'ELSCRM', 'ELSMOD', 'ELSRE', 'ELSTCAP', 'ELSUPPORT',
        'ELSWEM', 'MRC1', 'MRSSO', 'RM', 'ELDMSI', 'ELLRT', 'ELTPI', 'CRMAI',
        'CDCDEB', 'ELDBAPR', 'ELDBCR', 'ELDBP', 'ELDBS', 'ELETL', 'CRMCM', 'DESKEL',
        'MOD2SC', 'ELCOMT', 'ELDM', 'FRMSMOD', 'MRIX', 'OEDARWIN', 'OEGRDTETON', 'OEHIMALAYA',
        'OEK2', 'OEKIRKJUFE', 'OET', 'OETWINMOU', 'OLYMPUS', 'CREDIT', 'LDET', 'DC',
        'MODTAI', 'MR', 'MRDRT', 'CSP', 'HW', 'EFORM', 'GCMT', 'FI',
        'KEYSTONE', 'MODSFI', 'LIEN', 'MODTAO', 'CSMSGISSUE', 'CCPADMIN', 'CCPAPPS', 'CCPBKND',
        'CCPDATA', 'CCPTXT', 'MRC2', 'CC',
    ],

    'Payments': [
        'EPAYTEAM', 'CDKPAY', 'CDKPAYIN', 'CDKPAYM',
    ],

    'Shared Services': [
        'CA', 'CDS', 'CDCM', 'CNV', 'USA', 'CAM', 'EIS', 'FSRE',
        'IAM', 'DNADD', 'MRCANON', 'GS', 'RDSDEV', 'CAR',
    ],

    'Title & Registration-CVR': [
        'CVRS', 'CVRCACONV', 'CVRCBE', 'CVRIN', 'CVRNC', 'CVRAL', 'CVRMA', 'CVRMD',
        'CVRPA', 'CVRSC', 'CVRVA', 'CVRWV', 'CVRHOST', 'CVRFL', 'CVRGA', 'CVRIL',
        'CVRILSUP', 'CVRCH', 'CVRCIS', 'CVRCLA', 'CVRDAESIGN', 'CVRDOCIMG', 'CVRJE', 'CVRNMVTI',
        'CVRRC', 'CVRMIWEB', 'CVRNCC', 'CVRNJ', 'CVRNY', 'CVRPAC', 'WICON',
    ],

}

# Reverse mapping: project key -> portfolio name
PROJECT_TO_PORTFOLIO: Dict[str, str] = {}
for portfolio, projects in PORTFOLIO_PROJECTS.items():
    for project in projects:
        PROJECT_TO_PORTFOLIO[project] = portfolio

PORTFOLIO_ALIASES: Dict[str, str] = {
    "data platforms": "Data Platform",
    "inventory management solution": "Inventory Management Solutions",
    "inventory management solutions": "Inventory Management Solutions",
    "ims": "Inventory Management Solutions",
}


def _normalize_name(value: str) -> str:
    """Normalize display names for forgiving portfolio matching."""
    return " ".join((value or "").replace("&", "and").split()).lower()


def get_portfolio_projects(portfolio: str) -> List[str]:
    """
    Get list of project keys for a given portfolio
    
    Args:
        portfolio: Portfolio name (e.g., "Data Solutions")
    
    Returns:
        List of project keys, or single project key if not found
    """
    portfolio = (portfolio or "").strip()
    normalized_portfolio = _normalize_name(portfolio)

    if normalized_portfolio == "all":
        return [project for projects in PORTFOLIO_PROJECTS.values() for project in projects]

    # Try exact match first
    if portfolio in PORTFOLIO_PROJECTS:
        return PORTFOLIO_PROJECTS[portfolio]

    # Try configured aliases next
    alias = PORTFOLIO_ALIASES.get(normalized_portfolio)
    if alias:
        return PORTFOLIO_PROJECTS[alias]

    # If it's an existing project key, return it directly
    project_key = portfolio.upper()
    if project_key in PROJECT_TO_PORTFOLIO:
        return [project_key]
    
    # Try case-insensitive match
    for name, projects in PORTFOLIO_PROJECTS.items():
        if _normalize_name(name) == normalized_portfolio:
            return projects
    
    # Try partial match
    for name, projects in PORTFOLIO_PROJECTS.items():
        normalized_name = _normalize_name(name)
        if normalized_portfolio in normalized_name or normalized_name in normalized_portfolio:
            return projects
    
    # If it looks like a project key, return as single-item list
    if len(portfolio) <= 10 and portfolio.isupper():
        return [portfolio]
    
    # Default to empty list (will trigger fallback behavior)
    return [portfolio]


def build_project_jql(portfolio: str) -> str:
    """
    Build JQL project filter for a given portfolio
    
    Args:
        portfolio: Portfolio name
    
    Returns:
        JQL string like "project = X" or "project IN (X, Y, Z)"
    """
    projects = get_portfolio_projects(portfolio)
    
    if len(projects) == 1:
        return f'project = "{projects[0]}"'
    elif len(projects) > 1:
        project_list = ", ".join(f'"{project}"' for project in projects)
        return f'project IN ({project_list})'
    else:
        return f'project = "{portfolio}"'


def get_all_portfolios() -> List[str]:
    """Get list of all portfolio names"""
    return list(PORTFOLIO_PROJECTS.keys())


def get_portfolio_for_project(project_key: str) -> str:
    """
    Get portfolio name for a given project key
    
    Args:
        project_key: Jira project key
    
    Returns:
        Portfolio name or "Unknown"
    """
    return PROJECT_TO_PORTFOLIO.get(project_key, "Unknown")


async def validate_projects(jira_client, projects: List[str]) -> tuple:
    """
    Validate which projects exist in Jira.
    
    Args:
        jira_client: JiraClient instance
        projects: List of project keys to validate
    
    Returns:
        Tuple of (valid_projects, invalid_projects)
        - valid_projects: List of project keys that exist
        - invalid_projects: List of project keys that don't exist
    """
    valid_projects = []
    invalid_projects = []
    
    try:
        all_jira_projects = await jira_client.get_projects()
        jira_project_keys = {p.get('key', '').upper() for p in all_jira_projects if p.get('key')}
        
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"📚 Jira has {len(jira_project_keys)} total projects in registry")
        
        for project in projects:
            if project.upper() in jira_project_keys:
                valid_projects.append(project)
                logger.debug(f"   ✅ {project} - VALID")
            else:
                invalid_projects.append(project)
                logger.debug(f"   ❌ {project} - INVALID (not in Jira)")
        
        if invalid_projects:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"⚠️ Found {len(invalid_projects)} invalid projects: {invalid_projects}. Using {len(valid_projects)} valid projects.")
        
        return valid_projects, invalid_projects
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"❌ Error validating projects: {e}. Proceeding with all {len(projects)} projects.")
        # On error, assume all projects are valid and proceed
        return projects, []


def build_project_jql_safe(projects: List[str]) -> str:
    """
    Build JQL project filter with validated projects.
    
    Args:
        projects: List of project keys (validated)
    
    Returns:
        JQL string like "project = X" or "project IN (X, Y, Z)"
    """
    if not projects:
        return ""
    
    if len(projects) == 1:
        return f'project = "{projects[0]}"'
    else:
        project_list = ", ".join(f'"{project}"' for project in projects)
        return f'project IN ({project_list})'


async def build_project_jql_with_validation(jira_client, portfolio: str) -> str:
    """
    Build JQL project filter with automatic project validation.
    
    This method gets the projects for a portfolio, validates them in Jira,
    removes invalid ones, and builds a safe JQL filter.
    Invalid projects are logged but don't stop execution.
    
    Args:
        jira_client: JiraClient instance
        portfolio: Portfolio name
    
    Returns:
        JQL string with only valid projects, or empty string if no valid projects
    
    Example Usage:
        project_filter = await build_project_jql_with_validation(self.jira, "Data Solutions")
        jql = f'{project_filter} AND issuetype = Test'
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"🔍 **VALIDATING PROJECTS** for portfolio: {portfolio}")
    
    # Get projects for portfolio
    projects = get_portfolio_projects(portfolio)
    logger.info(f"   📋 Found {len(projects)} projects to validate: {projects}")
    
    # Validate projects exist in Jira
    logger.info(f"   ⏳ Checking against Jira project registry...")
    valid_projects, invalid_projects = await validate_projects(jira_client, projects)
    
    if not valid_projects:
        logger.error(f"❌ **VALIDATION FAILED**: No valid projects found for '{portfolio}'. All {len(projects)} projects are invalid.")
        return ""
    
    if invalid_projects:
        logger.warning(f"⚠️ **VALIDATION RESULT**: Removed {len(invalid_projects)} invalid project(s): {invalid_projects}. Using {len(valid_projects)} valid project(s): {valid_projects}")
    else:
        logger.info(f"✅ **VALIDATION SUCCESS**: All {len(valid_projects)} projects are valid: {valid_projects}")
    
    # Build JQL with valid projects only
    logger.info(f"   🔗 Building JQL filter with {len(valid_projects)} validated project(s)...")
    jql_filter = build_project_jql_safe(valid_projects)
    logger.info(f"   ✨ JQL Filter ready: {jql_filter}")
    return jql_filter
