import { PageOutlet } from 'modulato'
import { Menu } from './shell/Menu'
import './styles/global.scss'

// The shell: everything outside <PageOutlet/> persists across navigation and
// reacts to the URL through useRoute()/useNavigation().
export default function App() {
  return (
    <>
      <Menu />
      <PageOutlet />
    </>
  )
}
