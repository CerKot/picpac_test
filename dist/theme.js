(() => {
  const key='picpac-theme';
  const apply=theme=>{
    const dark=theme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]').content=dark?'#201c29':'#F8F3F3';
  };
  try{apply(localStorage.getItem(key));}catch{apply('light');}
  window.setPicPacTheme=theme=>{
    apply(theme);
    try{localStorage.setItem(key,theme);}catch{}
  };
})();
