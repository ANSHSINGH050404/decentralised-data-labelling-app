export const Hero = () => {
    return (
        <div className="relative overflow-hidden">
            <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-indigo-50" />
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-200/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl" />
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight">
                    <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        Label Your Data
                    </span>
                    <br />
                    <span className="text-gray-900">With Ease</span>
                </h1>
                
                <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
                    The fastest way to get your images labeled by a distributed workforce. 
                    Secure, fast, and powered by Solana blockchain.
                </p>
                
                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full shadow-sm">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-gray-700 font-medium">No sign-up required</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-full shadow-sm">
                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span className="text-gray-700 font-medium">Blockchain secured</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
