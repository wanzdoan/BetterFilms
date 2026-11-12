    function initNoLink() {
        if (state.noLink || !$) return;
        var $links = $('a[href]#no-link');
        if (!$links.length) return;
        state.noLink = true;
        setTimeout(function () {
            $('a[href]#no-link').each(function () {
                var href = this.href;
                $(this).removeAttr('href').css('cursor', 'pointer').on('click.hdcNoLink', function () {
                    if (String(href || '').toLowerCase().indexOf('#') < 0) {
                        window.open(href, '_self');
                    }
                });
            });
        }, 500);
    }

