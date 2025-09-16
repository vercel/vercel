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

    return HttpResponse(
        f'template-ok:{tpl_ok};admin-template-ok:{admin_tpl};admin-static-ok:{admin_static};i18n-ok:{i18n_ok}'
    )


