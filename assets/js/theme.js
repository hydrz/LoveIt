class Util {
    forEach(elements, handler) {
        elements = elements || [];
        for (let i = 0; i < elements.length; i++) handler(elements[i]);
    }

    getScrollTop() {
        return (document.documentElement && document.documentElement.scrollTop) || document.body.scrollTop;
    }

    isMobile() {
        return window.matchMedia('only screen and (max-width: 680px)').matches;
    }

    isTocStatic() {
        return window.matchMedia('only screen and (max-width: 960px)').matches;
    }

    animateCSS(element, animation, reserved, callback) {
        if (!Array.isArray(animation)) animation = [animation];
        element.classList.add('animated', ...animation);
        const handler = () => {
            element.classList.remove('animated', ...animation);
            element.removeEventListener('animationend', handler);
            if (typeof callback === 'function') callback();
        };
        if (!reserved) element.addEventListener('animationend', handler, false);
    }
}

class Theme {
    constructor() {
        this.config = window.config;
        this.data = this.config.data;
        this.isDark = document.body.getAttribute('data-color-mode') === 'dark';
        this.util = new Util();
        this.newScrollTop = this.util.getScrollTop();
        this.oldScrollTop = this.newScrollTop;
        this.scrollEventSet = new Set();
        this.resizeEventSet = new Set();
        this.switchThemeEventSet = new Set();
        this.clickMaskEventSet = new Set();
        if (window.objectFitImages) objectFitImages();
    }

    initSVGIcon() {
        this.util.forEach(document.querySelectorAll('[data-svg-src]'), $icon => {
            fetch($icon.getAttribute('data-svg-src'))
                .then(response => response.text())
                .then(svg => {
                    const $temp = document.createElement('div');
                    $temp.insertAdjacentHTML('afterbegin', svg);
                    const $svg = $temp.firstChild;
                    $svg.setAttribute('data-svg-src', $icon.getAttribute('data-svg-src'));
                    $svg.classList.add('icon');
                    const $titleElements = $svg.getElementsByTagName('title');
                    if ($titleElements.length) $svg.removeChild($titleElements[0]);
                    $icon.parentElement.replaceChild($svg, $icon);
                })
                .catch(err => { console.error(err); });
        });
    }

    initTwemoji() {
        if (this.config.twemoji) twemoji.parse(document.body);
    }

    initMenuMobile() {
        const $menuToggleMobile = document.getElementById('menu-toggle-mobile');
        const $menuMobile = document.getElementById('menu-mobile');
        $menuToggleMobile.addEventListener('click', () => {
            document.body.classList.toggle('blur');
            $menuToggleMobile.classList.toggle('active');
            $menuMobile.classList.toggle('active');
        }, false);
        this._menuMobileOnClickMask = this._menuMobileOnClickMask || (() => {
            $menuToggleMobile.classList.remove('active');
            $menuMobile.classList.remove('active');
        });
        this.clickMaskEventSet.add(this._menuMobileOnClickMask);
    }

    initSwitchTheme() {
        this.util.forEach(document.getElementsByClassName('theme-switch'), $themeSwitch => {
            $themeSwitch.addEventListener('click', () => {
                if (document.body.getAttribute('data-color-mode') === 'dark') document.body.setAttribute('data-color-mode', 'light');
                else document.body.setAttribute('data-color-mode', 'dark');
                this.isDark = !this.isDark;
                window.localStorage && localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
                for (let event of this.switchThemeEventSet) event();
            }, false);
        });
    }

    initSearch() {
        const searchConfig = this.config.search;
        if (!searchConfig || this._searchOnce) return;

        const maxResultLength = searchConfig.maxResultLength ? searchConfig.maxResultLength : 10;
        const snippetLength = searchConfig.snippetLength ? searchConfig.snippetLength : 50;
        const highlightTag = searchConfig.highlightTag ? searchConfig.highlightTag : 'em';

        const $searchInput = document.getElementById(`search-input`);

        $searchInput.addEventListener('focus', () => {
            $searchInput.classList.add("jump-to-field-active");
            $searchInput.classList.add("jump-to-dropdown-visible");
            document.getElementById(`header-search-key-slash`).classList.add("d-none");
            document.getElementById(`jump-to-suggestions`).classList.remove("d-none");
        })

        $searchInput.addEventListener('blur', () => {
            $searchInput.classList.remove("jump-to-field-active");
            document.getElementById(`header-search-key-slash`).classList.remove("d-none");
            document.getElementById(`jump-to-suggestions`).classList.add("d-none");
        })

        this._searchOnce = true;
        this._searchOnClickMask = this._searchOnClickMask || (() => {
            this._search && this._search.autocomplete.setVal('');
        });
        this.clickMaskEventSet.add(this._searchOnClickMask);

        const initAutosearch = () => {
            const autosearch = autocomplete(`#search-input`, {
                hint: false,
                autoselect: true,
                dropdownMenuContainer: `#jump-to-suggestions`,
                clearOnSelected: true,
                cssClasses: { noPrefix: true },
                debug: true,
            }, {
                name: 'search',
                source: (query, callback) => {
                    const finish = (results) => {
                        callback(results);
                    };
                    if (searchConfig.type === 'lunr') {
                        const search = () => {
                            if (lunr.queryHandler) query = lunr.queryHandler(query);
                            const results = {};
                            this._index.search(query).forEach(({ ref, matchData: { metadata } }) => {
                                const matchData = this._indexData[ref];
                                let { uri, title, content: context } = matchData;
                                if (results[uri]) return;
                                let position = 0;
                                Object.values(metadata).forEach(({ content }) => {
                                    if (content) {
                                        const matchPosition = content.position[0][0];
                                        if (matchPosition < position || position === 0) position = matchPosition;
                                    }
                                });
                                position -= snippetLength / 5;
                                if (position > 0) {
                                    position += context.substr(position, 20).lastIndexOf(' ') + 1;
                                    context = '...' + context.substr(position, snippetLength);
                                } else {
                                    context = context.substr(0, snippetLength);
                                }
                                Object.keys(metadata).forEach(key => {
                                    title = title.replace(new RegExp(`(${key})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                    context = context.replace(new RegExp(`(${key})`, 'gi'), `<${highlightTag}>$1</${highlightTag}>`);
                                });
                                results[uri] = {
                                    'uri': uri,
                                    'title': title,
                                    'date': matchData.date,
                                    'context': context,
                                };
                            });
                            return Object.values(results).slice(0, maxResultLength);
                        }
                        if (!this._index) {
                            fetch(searchConfig.lunrIndexURL)
                                .then(response => response.json())
                                .then(data => {
                                    const indexData = {};
                                    this._index = lunr(function () {
                                        if (searchConfig.lunrLanguageCode) this.use(lunr[searchConfig.lunrLanguageCode]);
                                        this.ref('objectID');
                                        this.field('title', { boost: 50 });
                                        this.field('tags', { boost: 20 });
                                        this.field('categories', { boost: 20 });
                                        this.field('content', { boost: 10 });
                                        this.metadataWhitelist = ['position'];
                                        data.forEach((record) => {
                                            indexData[record.objectID] = record;
                                            this.add(record);
                                        });
                                    });
                                    this._indexData = indexData;
                                    finish(search());
                                }).catch(err => {
                                    console.error(err);
                                    finish([]);
                                });
                        } else finish(search());
                    } else if (searchConfig.type === 'algolia') {
                        this._algoliaIndex = this._algoliaIndex || algoliasearch(searchConfig.algoliaAppID, searchConfig.algoliaSearchKey).initIndex(searchConfig.algoliaIndex);
                        this._algoliaIndex
                            .search(query, {
                                offset: 0,
                                length: maxResultLength * 8,
                                attributesToHighlight: ['title'],
                                attributesToSnippet: [`content:${snippetLength}`],
                                highlightPreTag: `<${highlightTag}>`,
                                highlightPostTag: `</${highlightTag}>`,
                            })
                            .then(({ hits }) => {
                                const results = {};
                                hits.forEach(({ uri, date, _highlightResult: { title }, _snippetResult: { content } }) => {
                                    if (results[uri] && results[uri].context.length > content.value) return;
                                    results[uri] = {
                                        uri: uri,
                                        title: title.value,
                                        date: date,
                                        context: content.value,
                                    };
                                });
                                finish(Object.values(results).slice(0, maxResultLength));
                            })
                            .catch(err => {
                                console.error(err);
                                finish([]);
                            });
                    }
                },
                templates: {
                    suggestion: ({ title, date, context }) => `<div class="suggestion-row"><span class="suggestion-title">${title}</span><span class="suggestion-date">${date}</span></div><div class="suggestion-context">${context}</div>`,
                    empty: ({ query }) => `<div class="search-empty">${searchConfig.noResultsFound}: <span class="search-query">"${query}"</span></div>`,
                    // footer: ({ }) => {
                    //     const { searchType, icon, href } = searchConfig.type === 'algolia' ? {
                    //         searchType: 'algolia',
                    //         icon: '<i class="fab fa-algolia fa-fw"></i>',
                    //         href: 'https://www.algolia.com/',
                    //     } : {
                    //         searchType: 'Lunr.js',
                    //         icon: '',
                    //         href: 'https://lunrjs.com/',
                    //     };
                    //     return `<div class="search-footer">Search by <a href="${href}" rel="noopener noreffer" target="_blank">${icon} ${searchType}</a></div>`;
                    // },
                },
            });

            autosearch.on('autocomplete:selected', (_event, suggestion, _dataset, _context) => {
                window.location.assign(suggestion.uri);
            });

            this._search = autosearch;
        };
        if (searchConfig.lunrSegmentitURL && !document.getElementById('lunr-segmentit')) {
            const script = document.createElement('script');
            script.id = 'lunr-segmentit';
            script.type = 'text/javascript';
            script.src = searchConfig.lunrSegmentitURL;
            script.async = true;
            if (script.readyState) {
                script.onreadystatechange = () => {
                    if (script.readyState == 'loaded' || script.readyState == 'complete') {
                        script.onreadystatechange = null;
                        initAutosearch();
                    }
                };
            } else {
                script.onload = () => {
                    initAutosearch();
                };
            }
            document.body.appendChild(script);
        } else initAutosearch();
    }

    initDetails() {
        this.util.forEach(document.getElementsByClassName('details'), $details => {
            const $summaries = $details.getElementsByClassName('details-summary');
            for (let index = 0; index < $summaries.length; index++) {
                const $summary = $summaries[index];
                $summary.addEventListener('click', () => {
                    $details.classList.toggle('open');
                }, false);
            }
        });
    }

    initLightGallery() {
        if (this.config.lightGallery) lightGallery(document.getElementById('content'), this.config.lightGallery);
    }

    initHighlight() {
        this.util.forEach(document.querySelectorAll('.highlight > pre.chroma'), $preChroma => {
            const $chroma = document.createElement('div');
            $chroma.className = $preChroma.className;
            const $table = document.createElement('table');
            $chroma.appendChild($table);
            const $tbody = document.createElement('tbody');
            $table.appendChild($tbody);
            const $tr = document.createElement('tr');
            $tbody.appendChild($tr);
            const $td = document.createElement('td');
            $tr.appendChild($td);
            $preChroma.parentElement.replaceChild($chroma, $preChroma);
            $td.appendChild($preChroma);
        });
        this.util.forEach(document.querySelectorAll('.highlight > .chroma'), $chroma => {
            const $codeElements = $chroma.querySelectorAll('pre.chroma > code');
            if ($codeElements.length) {
                const $code = $codeElements[$codeElements.length - 1];
                const $header = document.createElement('div');
                $header.className = 'code-header ' + $code.className.toLowerCase();
                const $title = document.createElement('span');
                $title.classList.add('code-title');
                $title.insertAdjacentHTML('afterbegin', '<i class="arrow fas fa-chevron-right fa-fw"></i>');
                $title.addEventListener('click', () => {
                    $chroma.classList.toggle('open');
                }, false);
                $header.appendChild($title);
                const $ellipses = document.createElement('span');
                $ellipses.insertAdjacentHTML('afterbegin', '<i class="fas fa-ellipsis-h fa-fw"></i>');
                $ellipses.classList.add('ellipses');
                $ellipses.addEventListener('click', () => {
                    $chroma.classList.add('open');
                }, false);
                $header.appendChild($ellipses);
                const $copy = document.createElement('span');
                $copy.insertAdjacentHTML('afterbegin', '<i class="far fa-copy fa-fw"></i>');
                $copy.classList.add('copy');
                const code = $code.innerText;
                if (this.config.code.maxShownLines < 0 || code.split('\n').length < this.config.code.maxShownLines + 2) $chroma.classList.add('open');
                if (this.config.code.copyTitle) {
                    $copy.setAttribute('data-clipboard-text', code);
                    $copy.title = this.config.code.copyTitle;
                    const clipboard = new ClipboardJS($copy);
                    clipboard.on('success', _e => {
                        this.util.animateCSS($code, 'flash');
                    });
                    $header.appendChild($copy);
                }
                $chroma.insertBefore($header, $chroma.firstChild);
            }
        });
    }

    initTable() {
        this.util.forEach(document.querySelectorAll('.content table'), $table => {
            const $wrapper = document.createElement('div');
            $wrapper.className = 'table-wrapper';
            $table.parentElement.replaceChild($wrapper, $table);
            $wrapper.appendChild($table);
        });
    }

    initHeaderLink() {
        for (let num = 1; num <= 6; num++) {
            this.util.forEach(document.querySelectorAll('.single .content > h' + num), $header => {
                $header.classList.add('headerLink');
                $header.insertAdjacentHTML('afterbegin', `<a href="#${$header.id}" class="header-mark"></a>`);
            });
        }
    }

    initToc() {
        const $tocCore = document.getElementById('TableOfContents');
        if ($tocCore === null) return;
        $tocCore.removeAttribute("id");

        if (document.getElementById('toc-static').getAttribute('kept') || this.util.isTocStatic()) {
            const $tocContentStatic = document.getElementById('toc-content-static');
            $tocContentStatic.appendChild($tocCore.cloneNode(true));
        }

        const $tocContentAuto = document.getElementById('toc-content-auto');
        $tocContentAuto.appendChild($tocCore.cloneNode(true));

        const $tocLinkElements = $tocCore.querySelectorAll('a');
        const $headerLinkElements = document.getElementsByClassName('headerLink');

        this._tocOnScroll = this._tocOnScroll || (() => {
            this.util.forEach($tocLinkElements, $tocLink => { $tocLink.classList.remove('active'); });
            const INDEX_SPACING = 120;
            let activeTocIndex = $headerLinkElements.length - 1;
            for (let i = 0; i < $headerLinkElements.length - 1; i++) {
                const thisTop = $headerLinkElements[i].getBoundingClientRect().top;
                const nextTop = $headerLinkElements[i + 1].getBoundingClientRect().top;
                if ((i == 0 && thisTop > INDEX_SPACING)
                    || (thisTop <= INDEX_SPACING && nextTop > INDEX_SPACING)) {
                    activeTocIndex = i;
                    break;
                }
            }
            if (activeTocIndex !== -1) {
                $tocLinkElements[activeTocIndex].classList.add('active');
                let $parent = $tocLinkElements[activeTocIndex].parentElement;
                while ($parent !== $tocCore) {
                    $parent.classList.add('has-active');
                    $parent = $parent.parentElement.parentElement;
                }
            }
        });
        this._tocOnScroll();
        this.scrollEventSet.add(this._tocOnScroll);

    }

    initMath() {
        if (this.config.math) renderMathInElement(document.body, this.config.math);
    }

    initMermaid() {
        const $mermaidElements = document.getElementsByClassName('mermaid');
        if ($mermaidElements.length) {
            mermaid.initialize({ startOnLoad: false, theme: 'null' });
            this.util.forEach($mermaidElements, $mermaid => {
                mermaid.mermaidAPI.render('svg-' + $mermaid.id, this.data[$mermaid.id], svgCode => {
                    $mermaid.insertAdjacentHTML('afterbegin', svgCode);
                }, $mermaid);
            });
        }
    }

    initEcharts() {
        this._echartsOnSwitchTheme = this._echartsOnSwitchTheme || (() => {
            this._echartsArr = this._echartsArr || [];
            for (let i = 0; i < this._echartsArr.length; i++) {
                this._echartsArr[i].dispose();
            }
            this._echartsArr = [];
            this.util.forEach(document.getElementsByClassName('echarts'), $echarts => {
                const chart = echarts.init($echarts, this.isDark ? 'dark' : 'macarons', { renderer: 'svg' });
                chart.setOption(JSON.parse(this.data[$echarts.id]));
                this._echartsArr.push(chart);
            });
        });
        this.switchThemeEventSet.add(this._echartsOnSwitchTheme);
        this._echartsOnSwitchTheme();
        this._echartsOnResize = this._echartsOnResize || (() => {
            for (let i = 0; i < this._echartsArr.length; i++) {
                this._echartsArr[i].resize();
            }
        });
        this.resizeEventSet.add(this._echartsOnResize);
    }

    initMapbox() {
        if (this.config.mapbox) {
            mapboxgl.accessToken = this.config.mapbox.accessToken;
            mapboxgl.setRTLTextPlugin(this.config.mapbox.RTLTextPlugin);
            this._mapboxArr = this._mapboxArr || [];
            this.util.forEach(document.getElementsByClassName('mapbox'), $mapbox => {
                const { lng, lat, zoom, lightStyle, darkStyle, marked, navigation, geolocate, scale, fullscreen } = this.data[$mapbox.id];
                const mapbox = new mapboxgl.Map({
                    container: $mapbox,
                    center: [lng, lat],
                    zoom: zoom,
                    minZoom: .2,
                    style: this.isDark ? darkStyle : lightStyle,
                    attributionControl: false,
                });
                if (marked) {
                    new mapboxgl.Marker().setLngLat([lng, lat]).addTo(mapbox);
                }
                if (navigation) {
                    mapbox.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
                }
                if (geolocate) {
                    mapbox.addControl(new mapboxgl.GeolocateControl({
                        positionOptions: {
                            enableHighAccuracy: true,
                        },
                        showUserLocation: true,
                        trackUserLocation: true,
                    }), 'bottom-right');
                }
                if (scale) {
                    mapbox.addControl(new mapboxgl.ScaleControl());
                }
                if (fullscreen) {
                    mapbox.addControl(new mapboxgl.FullscreenControl());
                }
                mapbox.addControl(new MapboxLanguage());
                this._mapboxArr.push(mapbox);
            });
            this._mapboxOnSwitchTheme = this._mapboxOnSwitchTheme || (() => {
                this.util.forEach(this._mapboxArr, mapbox => {
                    const $mapbox = mapbox.getContainer();
                    const { lightStyle, darkStyle } = this.data[$mapbox.id];
                    mapbox.setStyle(this.isDark ? darkStyle : lightStyle);
                    mapbox.addControl(new MapboxLanguage());
                });
            });
            this.switchThemeEventSet.add(this._mapboxOnSwitchTheme);
        }
    }

    initTypeit() {
        if (this.config.typeit) {
            const typeitConfig = this.config.typeit;
            const speed = typeitConfig.speed ? typeitConfig.speed : 100;
            const cursorSpeed = typeitConfig.cursorSpeed ? typeitConfig.cursorSpeed : 1000;
            const cursorChar = typeitConfig.cursorChar ? typeitConfig.cursorChar : '|';
            Object.values(typeitConfig.data).forEach(group => {
                const typeone = (i) => {
                    const id = group[i];
                    const instance = new TypeIt(`#${id}`, {
                        strings: this.data[id],
                        speed: speed,
                        lifeLike: true,
                        cursorSpeed: cursorSpeed,
                        cursorChar: cursorChar,
                        waitUntilVisible: true,
                        afterComplete: () => {
                            if (i === group.length - 1) {
                                if (typeitConfig.duration >= 0) window.setTimeout(() => {
                                    instance.destroy();
                                }, typeitConfig.duration);
                                return;
                            }
                            instance.destroy();
                            typeone(i + 1);
                        },
                    }).go();
                };
                typeone(0);
            });
        }
    }

    initComment() {
        if (this.config.comment) {
            if (this.config.comment.gitalk) {
                this.config.comment.gitalk.body = decodeURI(window.location.href);
                const gitalk = new Gitalk(this.config.comment.gitalk);
                gitalk.render('gitalk');
            }
            if (this.config.comment.valine) new Valine(this.config.comment.valine);
            if (this.config.comment.utterances) {
                const utterancesConfig = this.config.comment.utterances;
                const script = document.createElement('script');
                script.src = 'https://utteranc.es/client.js';
                script.type = 'text/javascript';
                script.setAttribute('repo', utterancesConfig.repo);
                script.setAttribute('issue-term', utterancesConfig.issueTerm);
                if (utterancesConfig.label) script.setAttribute('label', utterancesConfig.label);
                script.setAttribute('theme', this.isDark ? utterancesConfig.darkTheme : utterancesConfig.lightTheme);
                script.crossOrigin = 'anonymous';
                script.async = true;
                document.getElementById('utterances').appendChild(script);
                this._utterancesOnSwitchTheme = this._utterancesOnSwitchTheme || (() => {
                    const message = {
                        type: 'set-theme',
                        theme: this.isDark ? utterancesConfig.darkTheme : utterancesConfig.lightTheme,
                    };
                    const iframe = document.querySelector('.utterances-frame');
                    iframe.contentWindow.postMessage(message, 'https://utteranc.es');
                });
                this.switchThemeEventSet.add(this._utterancesOnSwitchTheme);
            }
        }
    }

    initSmoothScroll() {
        if (SmoothScroll) new SmoothScroll('[href^="#"]', { speed: 300, speedAsDuration: true, header: '#header-desktop' });
    }

    initCookieconsent() {
        if (this.config.cookieconsent) cookieconsent.initialise(this.config.cookieconsent);
    }

    onScroll() {
        const $headers = [];
        if (document.body.getAttribute('header-desktop') === 'auto') $headers.push(document.getElementById('header-desktop'));
        if (document.body.getAttribute('header-mobile') === 'auto') $headers.push(document.getElementById('header-mobile'));
        if (document.getElementById('comments')) {
            const $viewComments = document.getElementById('view-comments');
            $viewComments.href = `#comments`;
            $viewComments.style.display = 'block';
        }
        const $fixedButtons = document.getElementById('fixed-buttons');
        const ACCURACY = 20, MINIMUM = 100;
        window.addEventListener('scroll', () => {
            this.newScrollTop = this.util.getScrollTop();
            const scroll = this.newScrollTop - this.oldScrollTop;
            const isMobile = this.util.isMobile();
            this.util.forEach($headers, $header => {
                if (scroll > ACCURACY) {
                    $header.classList.remove('fadeInDown');
                    this.util.animateCSS($header, ['fadeOutUp', 'faster'], true);
                } else if (scroll < - ACCURACY) {
                    $header.classList.remove('fadeOutUp');
                    this.util.animateCSS($header, ['fadeInDown', 'faster'], true);
                }
            });
            if (this.newScrollTop > MINIMUM) {
                if (isMobile && scroll > ACCURACY) {
                    $fixedButtons.classList.remove('fadeIn');
                    this.util.animateCSS($fixedButtons, ['fadeOut', 'faster'], true);
                } else if (!isMobile || scroll < - ACCURACY) {
                    $fixedButtons.style.display = 'block';
                    $fixedButtons.classList.remove('fadeOut');
                    this.util.animateCSS($fixedButtons, ['fadeIn', 'faster'], true);
                }
            } else {
                if (!isMobile) {
                    $fixedButtons.classList.remove('fadeIn');
                    this.util.animateCSS($fixedButtons, ['fadeOut', 'faster'], true);
                }
                $fixedButtons.style.display = 'none';
            }
            for (let event of this.scrollEventSet) event();
            this.oldScrollTop = this.newScrollTop;
        }, false);
    }

    onResize() {
        window.addEventListener('resize', () => {
            if (!this._resizeTimeout) {
                this._resizeTimeout = window.setTimeout(() => {
                    this._resizeTimeout = null;
                    for (let event of this.resizeEventSet) event();
                    this.initToc();
                    this.initMermaid();
                    this.initSearch();
                }, 100);
            }
        }, false);
    }

    onClickMask() {
        document.getElementById('mask').addEventListener('click', () => {
            for (let event of this.clickMaskEventSet) event();
            document.body.classList.remove('blur');
        }, false);
    }

    init() {
        try {
            this.initSVGIcon();
            this.initTwemoji();
            // this.initMenuMobile();
            this.initSwitchTheme();
            this.initSearch();
            this.initDetails();
            this.initLightGallery();
            this.initHighlight();
            this.initTable();
            this.initHeaderLink();
            this.initSmoothScroll();
            this.initMath();
            this.initMermaid();
            this.initEcharts();
            this.initTypeit();
            this.initMapbox();
            this.initCookieconsent();
        } catch (err) {
            console.error(err);
        }

        window.setTimeout(() => {
            this.initToc();
            this.initComment();

            this.onScroll();
            this.onResize();
            this.onClickMask();
        }, 100);
    }
}

const themeInit = () => {
    const theme = new Theme();
    theme.init();
};

if (document.readyState !== 'loading') {
    themeInit();
} else {
    document.addEventListener('DOMContentLoaded', themeInit, false);
}
