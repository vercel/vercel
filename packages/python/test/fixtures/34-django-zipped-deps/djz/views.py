from django.http import HttpResponse
from django.template.loader import render_to_string, get_template
from django.contrib.staticfiles import finders
from django.utils.translation import gettext as _


def index(request):
    # App template (local project)
    rendered = render_to_string('djz/sample.html', {'value': 1})
    tpl_ok = 'ok' if 'sample' in rendered else 'fail'

    # Django admin template exists (from Django package)
    try:
        get_template('admin/base.html')
        admin_tpl = 'ok'
    except Exception:
        admin_tpl = 'fail'

    # Django admin static file exists (from Django package)
    admin_css_path = finders.find('admin/css/base.css')
    admin_static = 'ok' if isinstance(admin_css_path, str) else 'fail'

    # Basic i18n call (ensures translation machinery can load)
    trans = _('yes')
    i18n_ok = 'ok' if isinstance(trans, str) and len(trans) > 0 else 'fail'

    base = f'template-ok:{tpl_ok};admin-template-ok:{admin_tpl};admin-static-ok:{admin_static};i18n-ok:{i18n_ok}'

    tokens = []

    try:
        from importlib import metadata as im  # type: ignore
        v = im.version('Django')
        tokens.append('metadata-version-ok:ok' if isinstance(v, str) and len(v) > 0 else 'metadata-version-ok:fail')
    except Exception:
        tokens.append('metadata-version-ok:fail')

    try:
        import pkg_resources  # type: ignore
        v2 = pkg_resources.get_distribution('Django').version
        tokens.append('pkg-resources-version-ok:ok' if isinstance(v2, str) and len(v2) > 0 else 'pkg-resources-version-ok:fail')
    except Exception:
        tokens.append('pkg-resources-version-ok:fail')

    try:
        import pkg_resources  # type: ignore
        import os as _os
        p = pkg_resources.resource_filename('django', '__init__.py')
        ok = isinstance(p, str) and _os.path.isfile(p)
        if ok:
            with open(p, 'rb') as f:
                _ = f.read(1)
        tokens.append('resource-filename-works:ok' if ok else 'resource-filename-works:fail')
    except Exception:
        tokens.append('resource-filename-works:fail')

    try:
        from importlib import resources as _ilr  # type: ignore
        with _ilr.as_file(_ilr.files('django').joinpath('__init__.py')) as p:
            with open(p, 'r', encoding='utf-8') as f:
                s = f.read()
        ok = isinstance(s, str) and len(s) > 0
        tokens.append('as-file-works:ok' if ok else 'as-file-works:fail')
    except Exception:
        tokens.append('as-file-works:fail')

    try:
        import sys as _sys
        ok = any(str(x).endswith('_vendor-py.zip') for x in _sys.path)
        tokens.append('vendor-zip-in-sys-path:ok' if ok else 'vendor-zip-in-sys-path:fail')
    except Exception:
        tokens.append('vendor-zip-in-sys-path:fail')

    if tokens:
        base = base + ';' + ';'.join(tokens)

    return HttpResponse(base)


