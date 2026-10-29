import './styles.css';
import { startApp } from './ui/app';

if (new URLSearchParams(location.search).has('frame')) document.body.classList.add('framed');
startApp();
