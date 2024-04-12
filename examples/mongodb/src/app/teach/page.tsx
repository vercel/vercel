'use client';

import { FilePond } from 'react-filepond';
import NavBar from '../component/navbar';
import 'filepond/dist/filepond.min.css';

export default function Home() {

    return (
        <main>
            <NavBar />
            <div className='items-center justify-between p-24'>
                <FilePond 
                    allowMultiple={false}
                    credits={false}
                    server={{
                        url: "/api/upload"
                    }}
                />
            </div>
        </main>

    );
}